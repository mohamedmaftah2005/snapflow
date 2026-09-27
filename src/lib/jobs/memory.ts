import type { DownloadItemRecord, DownloadJobRecord } from "./types";
import type { JobRepository } from "./repository";
import { decodeHistoryCursor, encodeHistoryCursor } from "./repository";

/** In-memory repository for local dev and tests. Not shared across processes. */
export class MemoryJobRepository implements JobRepository {
  private map = new Map<string, DownloadJobRecord>();
  private items = new Map<string, DownloadItemRecord[]>();

  async create(rec: DownloadJobRecord): Promise<void> {
    this.map.set(rec.id, { ...rec });
  }

  async get(id: string): Promise<DownloadJobRecord | undefined> {
    const rec = this.map.get(id);
    return rec ? { ...rec } : undefined;
  }

  async getMany(ids: string[]): Promise<DownloadJobRecord[]> {
    const out: DownloadJobRecord[] = [];
    for (const id of ids.slice(0, 100)) {
      const rec = this.map.get(id);
      if (rec) out.push({ ...rec });
    }
    return out;
  }

  async update(id: string, patch: Partial<DownloadJobRecord>): Promise<void> {
    const cur = this.map.get(id);
    if (cur) this.map.set(id, { ...cur, ...patch });
  }

  async findExpired(now: number, limit: number): Promise<DownloadJobRecord[]> {
    const out: DownloadJobRecord[] = [];
    for (const rec of this.map.values()) {
      if (rec.status === "COMPLETED" && rec.expiresAt < now) {
        out.push({ ...rec });
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  async countActive(): Promise<number> {
    let n = 0;
    for (const rec of this.map.values()) {
      if (rec.status === "PENDING" || rec.status === "QUEUED" || rec.status === "PROCESSING" || rec.status === "UPLOADING") {
        n += 1;
      }
    }
    return n;
  }

  async countActiveByUser(userId: string): Promise<number> {
    let n = 0;
    for (const rec of this.map.values()) {
      if (
        (rec as DownloadJobRecord & { userId?: string }).userId === userId &&
        (rec.status === "PENDING" || rec.status === "QUEUED" || rec.status === "PROCESSING" || rec.status === "UPLOADING")
      ) {
        n += 1;
      }
    }
    return n;
  }

  async findStalled(beforeMs: number, limit: number): Promise<DownloadJobRecord[]> {
    const out: DownloadJobRecord[] = [];
    for (const rec of this.map.values()) {
      if (
        (rec.status === "PROCESSING" || rec.status === "UPLOADING") &&
        (rec.startedAt ?? rec.createdAt) < beforeMs
      ) {
        out.push({ ...rec });
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  async purgeTerminal(beforeMs: number, limit: number): Promise<number> {
    let n = 0;
    for (const [id, rec] of this.map) {
      if (
        (rec.status === "FAILED" || rec.status === "EXPIRED") &&
        (rec.completedAt ?? rec.createdAt) < beforeMs
      ) {
        this.map.delete(id);
        this.items.delete(id);
        n += 1;
        if (n >= limit) break;
      }
    }
    return n;
  }

  async saveItems(jobId: string, items: DownloadItemRecord[]): Promise<void> {
    this.items.set(jobId, items.map((i) => ({ ...i })));
  }

  async getItems(jobId: string): Promise<DownloadItemRecord[]> {
    return (this.items.get(jobId) ?? []).map((i) => ({ ...i }));
  }

  async listByUser(userId: string, limit: number): Promise<DownloadJobRecord[]> {
    return [...this.map.values()]
      .filter((r) => (r as DownloadJobRecord & { userId?: string }).userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async listHistory(userId: string, opts: {
    status?: string; provider?: string; limit: number; offset: number;
  }): Promise<{ jobs: DownloadJobRecord[]; total: number }> {
    const all = [...this.map.values()]
      .filter((r) => {
        const u = (r as DownloadJobRecord & { userId?: string }).userId;
        if (u !== userId) return false;
        if (opts.status && r.status !== opts.status) return false;
        if (opts.provider && r.provider !== opts.provider) return false;
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    return {
      jobs: all.slice(opts.offset, opts.offset + opts.limit).map((r) => ({ ...r })),
      total: all.length,
    };
  }

  async deleteJob(id: string): Promise<void> {
    this.map.delete(id);
    this.items.delete(id);
  }

  async listHistoryCursor(userId: string, opts: {
    status?: string; provider?: string; limit: number; cursor?: string;
  }): Promise<{ jobs: DownloadJobRecord[]; nextCursor: string | null }> {
    const anchor = opts.cursor ? decodeHistoryCursor(opts.cursor) : null;
    const all = [...this.map.values()]
      .filter((r) => {
        const u = (r as DownloadJobRecord & { userId?: string }).userId;
        if (u !== userId) return false;
        if (opts.status && r.status !== opts.status) return false;
        if (opts.provider && r.provider !== opts.provider) return false;
        if (anchor && !(r.createdAt < anchor.createdAt || (r.createdAt === anchor.createdAt && r.id < anchor.id))) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    const jobs = all.slice(0, Math.min(Math.max(opts.limit, 1), 50)).map((r) => ({ ...r }));
    const last = jobs[jobs.length - 1];
    return { jobs, nextCursor: last ? encodeHistoryCursor(last.createdAt, last.id) : null };
  }

  // ---- admin ----

  async countByStatus(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const r of this.map.values()) out[r.status] = (out[r.status] ?? 0) + 1;
    return out;
  }

  async countSince(sinceMs: number): Promise<number> {
    return [...this.map.values()].filter((r) => r.createdAt >= sinceMs).length;
  }

  async providerStats(sinceMs: number): Promise<{ provider: string; total: number; failed: number; avgMs: number | null }[]> {
    const by = new Map<string, { total: number; failed: number; sum: number; n: number }>();
    for (const r of this.map.values()) {
      if (r.createdAt < sinceMs) continue;
      const e = by.get(r.provider) ?? { total: 0, failed: 0, sum: 0, n: 0 };
      e.total += 1;
      if (r.status === "FAILED") e.failed += 1;
      if (r.startedAt && r.completedAt && r.completedAt >= r.startedAt) {
        e.sum += r.completedAt - r.startedAt;
        e.n += 1;
      }
      by.set(r.provider, e);
    }
    return [...by.entries()].map(([provider, e]) => ({
      provider, total: e.total, failed: e.failed, avgMs: e.n > 0 ? Math.round(e.sum / e.n) : null,
    }));
  }

  async errorBreakdown(sinceMs: number, limit: number): Promise<{ code: string; count: number }[]> {
    const by = new Map<string, number>();
    for (const r of this.map.values()) {
      if (r.createdAt < sinceMs || r.status !== "FAILED" || !r.errorCode) continue;
      by.set(r.errorCode, (by.get(r.errorCode) ?? 0) + 1);
    }
    return [...by.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async listJobs(opts: {
    status?: string; provider?: string; userId?: string; sinceMs?: number;
    limit: number; offset: number;
  }): Promise<{ jobs: DownloadJobRecord[]; total: number }> {
    const all = [...this.map.values()].filter((r) => {
      if (opts.status && r.status !== opts.status) return false;
      if (opts.provider && r.provider !== opts.provider) return false;
      if (opts.userId && (r as DownloadJobRecord & { userId?: string }).userId !== opts.userId) return false;
      if (opts.sinceMs && r.createdAt < opts.sinceMs) return false;
      return true;
    });
    const total = all.length;
    const { sanitizeForLog } = await import("@/lib/logger");
    const jobs = all
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(opts.offset, opts.offset + opts.limit)
      .map((r) => ({ ...r, sourceUrl: sanitizeForLog(r.sourceUrl) }));
    return { jobs, total };
  }
}

let shared: MemoryJobRepository | null = null;

/** Shared in-process instance used by the web process (local driver). */
export function getMemoryRepository(): MemoryJobRepository {
  if (!shared) shared = new MemoryJobRepository();
  return shared;
}
