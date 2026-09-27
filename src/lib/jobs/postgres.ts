import { Pool } from "pg";
import { createPool } from "@/lib/db/pool";
import type { DownloadItemRecord, DownloadJobRecord, JobMediaType, JobProvider, JobStatus } from "./types";
import type { JobRepository } from "./repository";

const VALID_STATUSES: JobStatus[] = [
  "PENDING",
  "QUEUED",
  "PROCESSING",
  "UPLOADING",
  "COMPLETED",
  "FAILED",
  "EXPIRED",
  "CANCELED",
];

function toRecord(row: Record<string, unknown>): DownloadJobRecord {
  const status = String(row.status) as JobStatus;
  if (!VALID_STATUSES.includes(status)) throw new Error(`Unknown job status: ${status}`);
  return {
    id: String(row.id),
    status,
    provider: (row.provider as JobProvider) ?? "tiktok",
    sourceUrl: String(row.source_url),
    userId: (row.user_id as string | null) ?? undefined,
    maxFileSize: (row.max_file_size as number | null) ?? undefined,
    formatKind: ((row.format_kind as string | null) ?? "auto") as DownloadJobRecord["formatKind"],
    formatHeight: (row.format_height as number | null) ?? undefined,
    sourceId: (row.source_id as string | null) ?? undefined,
    mediaType: (row.media_type as JobMediaType | null) ?? undefined,
    title: (row.title as string | null) ?? undefined,
    thumbnail: (row.thumbnail as string | null) ?? undefined,
    duration: (row.duration as number | null) ?? undefined,
    format: (row.format as string | null) ?? undefined,
    resolution: (row.resolution as string | null) ?? undefined,
    fileKey: (row.file_key as string | null) ?? undefined,
    fileSize: (row.file_size as number | null) ?? undefined,
    attempts: Number(row.attempts ?? 0),
    createdAt: new Date(row.created_at as string).getTime(),
    startedAt: row.started_at ? new Date(row.started_at as string).getTime() : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at as string).getTime() : undefined,
    expiresAt: new Date(row.expires_at as string).getTime(),
    errorCode: (row.error_code as string | null) ?? undefined,
    errorMessage: (row.error_message as string | null) ?? undefined,
  };
}

/** PostgreSQL-backed repository. Run db/migrations/001_jobs.sql first. */
export class PostgresJobRepository implements JobRepository {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = createPool(connectionString, { name: "jobs", max: 5 });
  }

  async create(rec: DownloadJobRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO download_jobs
        (id, status, provider, source_url, source_id, media_type, user_id, max_file_size,
         format_kind, format_height,
         title, thumbnail, duration, format, resolution,
         file_key, file_size, attempts, created_at, started_at, completed_at, expires_at,
         error_code, error_message)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
         to_timestamp($19/1000.0), to_timestamp($20/1000.0), to_timestamp($21/1000.0), to_timestamp($22/1000.0),
         $23,$24)`,
      [
        rec.id,
        rec.status,
        rec.provider,
        rec.sourceUrl,
        rec.sourceId ?? null,
        rec.mediaType ?? null,
        rec.userId ?? null,
        rec.maxFileSize ?? null,
        rec.formatKind ?? "auto",
        rec.formatHeight ?? null,
        rec.title ?? null,
        rec.thumbnail ?? null,
        rec.duration ?? null,
        rec.format ?? null,
        rec.resolution ?? null,
        rec.fileKey ?? null,
        rec.fileSize ?? null,
        rec.attempts,
        rec.createdAt,
        rec.startedAt ?? null,
        rec.completedAt ?? null,
        rec.expiresAt,
        rec.errorCode ?? null,
        rec.errorMessage ?? null,
      ]
    );
  }

  async get(id: string): Promise<DownloadJobRecord | undefined> {
    const r = await this.pool.query("SELECT * FROM download_jobs WHERE id = $1", [id]);
    if (r.rowCount === 0) return undefined;
    return toRecord(r.rows[0] as Record<string, unknown>);
  }

  async getMany(ids: string[]): Promise<DownloadJobRecord[]> {
    if (ids.length === 0) return [];
    // Cap fan-out size: callers batch progress over ≤ maxBatchItems jobs.
    const r = await this.pool.query("SELECT * FROM download_jobs WHERE id = ANY($1)", [ids.slice(0, 100)]);
    return (r.rows as Record<string, unknown>[]).map(toRecord);
  }

  async update(id: string, patch: Partial<DownloadJobRecord>): Promise<void> {
    const cur = await this.get(id);
    if (!cur) return;
    const next: DownloadJobRecord = { ...cur, ...patch };
    await this.pool.query(
      `UPDATE download_jobs SET
         status=$2, source_id=$3, media_type=$4, title=$5, thumbnail=$6, duration=$7, format=$8, resolution=$9,
         file_key=$10, file_size=$11, attempts=$12,
         started_at=to_timestamp($13/1000.0), completed_at=to_timestamp($14/1000.0),
         expires_at=to_timestamp($15/1000.0), error_code=$16, error_message=$17
       WHERE id=$1`,
      [
        id,
        next.status,
        next.sourceId ?? null,
        next.mediaType ?? null,
        next.title ?? null,
        next.thumbnail ?? null,
        next.duration ?? null,
        next.format ?? null,
        next.resolution ?? null,
        next.fileKey ?? null,
        next.fileSize ?? null,
        next.attempts,
        next.startedAt ?? null,
        next.completedAt ?? null,
        next.expiresAt,
        next.errorCode ?? null,
        next.errorMessage ?? null,
      ]
    );
  }

  async findExpired(now: number, limit: number): Promise<DownloadJobRecord[]> {
    const r = await this.pool.query(
      `SELECT * FROM download_jobs
       WHERE status='COMPLETED' AND expires_at < to_timestamp($1/1000.0)
       ORDER BY expires_at ASC LIMIT $2`,
      [now, limit]
    );
    return (r.rows as Record<string, unknown>[]).map(toRecord);
  }

  async countActive(): Promise<number> {
    const r = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM download_jobs
       WHERE status IN ('PENDING','QUEUED','PROCESSING','UPLOADING')`
    );
    return Number((r.rows[0] as { n: number }).n ?? 0);
  }

  async countActiveByUser(userId: string): Promise<number> {
    const r = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM download_jobs
       WHERE user_id = $1 AND status IN ('PENDING','QUEUED','PROCESSING','UPLOADING')`,
      [userId]
    );
    return Number((r.rows[0] as { n: number }).n ?? 0);
  }

  async findStalled(beforeMs: number, limit: number): Promise<DownloadJobRecord[]> {
    const r = await this.pool.query(
      `SELECT * FROM download_jobs
       WHERE status IN ('PROCESSING','UPLOADING')
         AND COALESCE(started_at, created_at) < to_timestamp($1/1000.0)
       ORDER BY created_at ASC LIMIT $2`,
      [beforeMs, limit]
    );
    return (r.rows as Record<string, unknown>[]).map(toRecord);
  }

  async purgeTerminal(beforeMs: number, limit: number): Promise<number> {
    const r = await this.pool.query(
      `DELETE FROM download_jobs WHERE id IN (
         SELECT id FROM download_jobs
         WHERE status IN ('FAILED','EXPIRED')
           AND COALESCE(completed_at, created_at) < to_timestamp($1/1000.0)
         ORDER BY created_at ASC LIMIT $2
       )`,
      [beforeMs, limit]
    );
    return r.rowCount ?? 0;
  }

  async saveItems(jobId: string, items: DownloadItemRecord[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM download_items WHERE job_id = $1", [jobId]);
      for (const it of items) {
        await client.query(
          `INSERT INTO download_items
            (id, job_id, type, format, container, resolution, width, height,
             file_key, file_size, local_path, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,to_timestamp($12/1000.0))`,
          [
            it.id,
            jobId,
            it.type,
            it.format,
            it.container,
            it.resolution ?? null,
            it.width ?? null,
            it.height ?? null,
            it.fileKey,
            it.fileSize ?? null,
            it.localPath ?? null,
            it.expiresAt,
          ]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async getItems(jobId: string): Promise<DownloadItemRecord[]> {
    const r = await this.pool.query("SELECT * FROM download_items WHERE job_id = $1 ORDER BY id ASC", [jobId]);
    return (r.rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      jobId: String(row.job_id),
      type: String(row.type) as DownloadItemRecord["type"],
      format: String(row.format),
      container: String(row.container),
      resolution: (row.resolution as string | null) ?? undefined,
      width: (row.width as number | null) ?? undefined,
      height: (row.height as number | null) ?? undefined,
      fileKey: String(row.file_key),
      fileSize: (row.file_size as number | null) ?? undefined,
      localPath: (row.local_path as string | null) ?? undefined,
      expiresAt: new Date(row.expires_at as string).getTime(),
    }));
  }

  async listByUser(userId: string, limit: number): Promise<DownloadJobRecord[]> {
    const r = await this.pool.query(
      "SELECT * FROM download_jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
      [userId, limit]
    );
    return (r.rows as Record<string, unknown>[]).map(toRecord);
  }

  async listHistory(userId: string, opts: {
    status?: string; provider?: string; limit: number; offset: number;
  }): Promise<{ jobs: DownloadJobRecord[]; total: number }> {
    const conds = ["user_id = $1"];
    const vals: unknown[] = [userId];
    let i = 2;
    if (opts.status) { conds.push(`status = $${i++}`); vals.push(opts.status); }
    if (opts.provider) { conds.push(`provider = $${i++}`); vals.push(opts.provider); }
    const where = `WHERE ${conds.join(" AND ")}`;
    const total = Number(
      (await this.pool.query(`SELECT COUNT(*)::int AS n FROM download_jobs ${where}`, vals)).rows[0].n
    );
    const r = await this.pool.query(
      `SELECT * FROM download_jobs ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, opts.limit, opts.offset]
    );
    return { jobs: (r.rows as Record<string, unknown>[]).map(toRecord), total };
  }

  async deleteJob(id: string): Promise<void> {
    await this.pool.query("DELETE FROM download_jobs WHERE id = $1", [id]);
  }

  async listHistoryCursor(userId: string, opts: {
    status?: string; provider?: string; limit: number; cursor?: string;
  }): Promise<{ jobs: DownloadJobRecord[]; nextCursor: string | null }> {
    const { decodeHistoryCursor, encodeHistoryCursor } = await import("./repository");
    const conds = ["user_id = $1"];
    const vals: unknown[] = [userId];
    let i = 2;
    if (opts.status) { conds.push(`status = $${i++}`); vals.push(opts.status); }
    if (opts.provider) { conds.push(`provider = $${i++}`); vals.push(opts.provider); }
    const anchor = opts.cursor ? decodeHistoryCursor(opts.cursor) : null;
    if (anchor) {
      conds.push(`(created_at, id) < (to_timestamp($${i++}/1000.0), $${i++})`);
      vals.push(anchor.createdAt, anchor.id);
    }
    const r = await this.pool.query(
      `SELECT * FROM download_jobs WHERE ${conds.join(" AND ")}
       ORDER BY created_at DESC, id DESC LIMIT $${i++}`,
      [...vals, Math.min(Math.max(opts.limit, 1), 50)]
    );
    const jobs = (r.rows as Record<string, unknown>[]).map(toRecord);
    const last = jobs[jobs.length - 1];
    return { jobs, nextCursor: last ? encodeHistoryCursor(last.createdAt, last.id) : null };
  }

  // ---- admin ----

  async countByStatus(): Promise<Record<string, number>> {
    const r = await this.pool.query("SELECT status, COUNT(*)::int AS n FROM download_jobs GROUP BY status");
    const out: Record<string, number> = {};
    for (const row of r.rows as { status: string; n: number }[]) out[row.status] = row.n;
    return out;
  }

  async countSince(sinceMs: number): Promise<number> {
    const r = await this.pool.query(
      "SELECT COUNT(*)::int AS n FROM download_jobs WHERE created_at > to_timestamp($1/1000.0)", [sinceMs]
    );
    return Number((r.rows[0] as { n: number }).n ?? 0);
  }

  async providerStats(sinceMs: number): Promise<{ provider: string; total: number; failed: number; avgMs: number | null }[]> {
    const r = await this.pool.query(
      `SELECT provider,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
              AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)
                FILTER (WHERE started_at IS NOT NULL AND completed_at IS NOT NULL)::int AS avg_ms
       FROM download_jobs WHERE created_at > to_timestamp($1/1000.0) GROUP BY provider`,
      [sinceMs]
    );
    return (r.rows as { provider: string; total: number; failed: number; avg_ms: number | null }[]).map((row) => ({
      provider: row.provider, total: row.total, failed: row.failed, avgMs: row.avg_ms,
    }));
  }

  async errorBreakdown(sinceMs: number, limit: number): Promise<{ code: string; count: number }[]> {
    const r = await this.pool.query(
      `SELECT error_code AS code, COUNT(*)::int AS count FROM download_jobs
       WHERE status = 'FAILED' AND error_code IS NOT NULL AND created_at > to_timestamp($1/1000.0)
       GROUP BY error_code ORDER BY count DESC LIMIT $2`,
      [sinceMs, limit]
    );
    return r.rows as { code: string; count: number }[];
  }

  async listJobs(opts: {
    status?: string; provider?: string; userId?: string; sinceMs?: number;
    limit: number; offset: number;
  }): Promise<{ jobs: DownloadJobRecord[]; total: number }> {
    const { sanitizeForLog } = await import("@/lib/logger");
    const conds: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (opts.status) { conds.push(`status = $${i++}`); vals.push(opts.status); }
    if (opts.provider) { conds.push(`provider = $${i++}`); vals.push(opts.provider); }
    if (opts.userId) { conds.push(`user_id = $${i++}`); vals.push(opts.userId); }
    if (opts.sinceMs) { conds.push(`created_at > to_timestamp($${i++}/1000.0)`); vals.push(opts.sinceMs); }
    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
    const total = Number(
      (await this.pool.query(`SELECT COUNT(*)::int AS n FROM download_jobs ${where}`, vals)).rows[0].n
    );
    const r = await this.pool.query(
      `SELECT * FROM download_jobs ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, opts.limit, opts.offset]
    );
    const jobs = (r.rows as Record<string, unknown>[]).map((row) => {
      const rec = toRecord(row);
      return { ...rec, sourceUrl: sanitizeForLog(rec.sourceUrl) };
    });
    return { jobs, total };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
