import type { DownloadItemRecord, DownloadJobRecord, JobStatus } from "./types";

/**
 * Async source of truth for job metadata.
 * Memory impl = local dev/tests. Postgres impl = production.
 * Redis is NEVER the permanent store — only queue coordination.
 */
export interface JobRepository {
  create(rec: DownloadJobRecord): Promise<void>;
  get(id: string): Promise<DownloadJobRecord | undefined>;
  /** Batch fetch for fan-out paths (batch progress, webhook emit). Order not guaranteed. */
  getMany(ids: string[]): Promise<DownloadJobRecord[]>;
  /** Atomic status transition; implement with row-level compare-and-set. */
  update(id: string, patch: Partial<DownloadJobRecord>): Promise<void>;
  /** Jobs with status COMPLETED and expiresAt < now, for the cleanup loop. */
  findExpired(now: number, limit: number): Promise<DownloadJobRecord[]>;
  /** Non-terminal jobs (for the queue-flooding guard). */
  countActive(): Promise<number>;
  /** Non-terminal jobs owned by one user (per-user fairness cap). Guests return 0. */
  countActiveByUser(userId: string): Promise<number>;
  /** PROCESSING/UPLOADING jobs stuck since before `beforeMs` (crash recovery). */
  findStalled(beforeMs: number, limit: number): Promise<DownloadJobRecord[]>;
  /** Delete terminal FAILED/EXPIRED rows older than `beforeMs`. Returns count. */
  purgeTerminal(beforeMs: number, limit: number): Promise<number>;
  /** Replace all items of a job (worker completion is the only writer). */
  saveItems(jobId: string, items: DownloadItemRecord[]): Promise<void>;
  getItems(jobId: string): Promise<DownloadItemRecord[]>;
  /** Newest-first job list for an owner's history. */
  listByUser(userId: string, limit: number): Promise<DownloadJobRecord[]>;
  listHistory(userId: string, opts: {
    status?: string; provider?: string; limit: number; offset: number;
  }): Promise<{ jobs: DownloadJobRecord[]; total: number }>;
  /**
   * Keyset history page: single query, no COUNT, stable under inserts.
   * Ordering is (created_at DESC, id DESC); cursor is opaque.
   */
  listHistoryCursor(userId: string, opts: {
    status?: string; provider?: string; limit: number; cursor?: string;
  }): Promise<{ jobs: DownloadJobRecord[]; nextCursor: string | null }>;
  /** Owner-scoped hard delete of a job and its items (storage handled by caller). */
  deleteJob(id: string): Promise<void>;
  // ---- admin ----
  countByStatus(): Promise<Record<string, number>>;
  countSince(sinceMs: number): Promise<number>;
  providerStats(sinceMs: number): Promise<{ provider: string; total: number; failed: number; avgMs: number | null }[]>;
  errorBreakdown(sinceMs: number, limit: number): Promise<{ code: string; count: number }[]>;
  listJobs(opts: {
    status?: string; provider?: string; userId?: string; sinceMs?: number;
    limit: number; offset: number;
  }): Promise<{ jobs: DownloadJobRecord[]; total: number }>;
  close?(): Promise<void>;
}

export { type DownloadJobRecord, type DownloadItemRecord, type JobStatus };

/** Opaque keyset cursor: base64url("<createdAtMs>:<id>"). */
export function encodeHistoryCursor(createdAt: number, id: string): string {
  return Buffer.from(`${createdAt}:${id}`, "utf8").toString("base64url");
}

export function decodeHistoryCursor(cursor: string): { createdAt: number; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf(":");
    if (sep < 1) return null;
    const createdAt = Number(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (!Number.isFinite(createdAt) || createdAt <= 0 || id.length === 0 || id.length > 128) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
