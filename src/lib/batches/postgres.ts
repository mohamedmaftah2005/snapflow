import { Pool } from "pg";
import { createPool } from "@/lib/db/pool";
import type { BatchRecord, BatchStore } from "./types";

function toBatch(row: Record<string, unknown>): BatchRecord {
  const t = (v: unknown): number | undefined => (v ? new Date(v as string).getTime() : undefined);
  return {
    id: String(row.id),
    userId: (row.user_id as string | null) ?? undefined,
    guestKey: (row.guest_key as string | null) ?? undefined,
    status: row.status as BatchRecord["status"],
    formatKind: (row.format_kind as BatchRecord["formatKind"]) ?? "auto",
    formatHeight: (row.format_height as number | null) ?? undefined,
    archiveKey: (row.archive_key as string | null) ?? undefined,
    archiveSize: (row.archive_size as number | null) ?? undefined,
    archiveExpires: t(row.archive_expires),
    createdAt: new Date(row.created_at as string).getTime(),
    completedAt: t(row.completed_at),
  };
}

export class PostgresBatchStore implements BatchStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = createPool(connectionString, { name: "batches", max: 3 });
  }

  async createBatch(b: BatchRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO batch_jobs (id, user_id, guest_key, status, format_kind, format_height, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0))`,
      [b.id, b.userId ?? null, b.guestKey ?? null, b.status, b.formatKind, b.formatHeight ?? null, b.createdAt]
    );
  }

  async getBatch(id: string): Promise<BatchRecord | undefined> {
    const r = await this.pool.query("SELECT * FROM batch_jobs WHERE id = $1", [id]);
    return r.rowCount ? toBatch(r.rows[0] as Record<string, unknown>) : undefined;
  }

  async updateBatch(id: string, patch: Partial<BatchRecord>): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [id];
    let i = 2;
    if (patch.status !== undefined) { sets.push(`status = $${i++}`); vals.push(patch.status); }
    if (patch.archiveKey !== undefined) { sets.push(`archive_key = $${i++}`); vals.push(patch.archiveKey); }
    if (patch.archiveSize !== undefined) { sets.push(`archive_size = $${i++}`); vals.push(patch.archiveSize); }
    if (patch.archiveExpires !== undefined) {
      sets.push(`archive_expires = to_timestamp($${i++}/1000.0)`); vals.push(patch.archiveExpires);
    }
    if (patch.completedAt !== undefined) {
      sets.push(`completed_at = to_timestamp($${i++}/1000.0)`); vals.push(patch.completedAt);
    }
    if (sets.length === 0) return;
    await this.pool.query(`UPDATE batch_jobs SET ${sets.join(", ")} WHERE id = $1`, vals);
  }

  async addItems(batchId: string, jobIds: string[]): Promise<void> {
    for (let k = 0; k < jobIds.length; k++) {
      await this.pool.query(
        "INSERT INTO batch_items (batch_id, job_id, position) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [batchId, jobIds[k], k]
      );
    }
  }

  async getBatchJobIds(batchId: string): Promise<string[]> {
    const r = await this.pool.query("SELECT job_id FROM batch_items WHERE batch_id = $1 ORDER BY position ASC", [batchId]);
    return (r.rows as { job_id: string }[]).map((row) => row.job_id);
  }

  async listBatchesByUser(userId: string, limit: number, offset: number): Promise<{ batches: BatchRecord[]; total: number }> {
    const total = Number(
      (await this.pool.query("SELECT COUNT(*)::int AS n FROM batch_jobs WHERE user_id = $1", [userId])).rows[0].n
    );
    const r = await this.pool.query(
      "SELECT * FROM batch_jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [userId, limit, offset]
    );
    return { batches: (r.rows as Record<string, unknown>[]).map(toBatch), total };
  }

  async listRecent(limit: number, offset: number): Promise<{ batches: BatchRecord[]; total: number }> {
    const total = Number((await this.pool.query("SELECT COUNT(*)::int AS n FROM batch_jobs")).rows[0].n);
    const r = await this.pool.query(
      "SELECT * FROM batch_jobs ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    return { batches: (r.rows as Record<string, unknown>[]).map(toBatch), total };
  }

  async getBatchesForJob(jobId: string): Promise<string[]> {
    const r = await this.pool.query("SELECT batch_id FROM batch_items WHERE job_id = $1", [jobId]);
    return (r.rows as { batch_id: string }[]).map((row) => row.batch_id);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
