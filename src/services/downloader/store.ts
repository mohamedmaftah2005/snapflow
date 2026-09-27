export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "EXPIRED";

export interface JobRecord {
  id: string;
  status: JobStatus;
  normalizedUrl: string;
  createdAt: number;
  expiresAt: number;
  filePath?: string;
  mime?: string;
  size?: number;
  title?: string;
  thumbnail?: string;
  duration?: number;
  errorCode?: string;
}

export interface JobStore {
  create(rec: JobRecord): void;
  get(id: string): JobRecord | undefined;
  update(id: string, patch: Partial<JobRecord>): void;
  remove(id: string): void;
}

const VALID_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidFileId(id: string): boolean {
  return VALID_ID.test(id);
}

export function newJobId(): string {
  // 16 random chars, URL-safe, no user influence.
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  const buf = new Uint32Array(16);
  crypto.getRandomValues(buf);
  for (const v of buf) out += chars[v % chars.length];
  return out;
}

/** In-memory store. Phase 3 replaces with PostgreSQL without changing callers. */
class MemoryJobStore implements JobStore {
  private map = new Map<string, JobRecord>();
  create(rec: JobRecord): void {
    this.map.set(rec.id, rec);
  }
  get(id: string): JobRecord | undefined {
    return this.map.get(id);
  }
  update(id: string, patch: Partial<JobRecord>): void {
    const cur = this.map.get(id);
    if (cur) this.map.set(id, { ...cur, ...patch });
  }
  remove(id: string): void {
    this.map.delete(id);
  }
}

let shared: JobStore | null = null;

export function getJobStore(): JobStore {
  if (!shared) shared = new MemoryJobStore();
  return shared;
}

/** Test-only: fresh isolated store. */
export function createIsolatedStore(): JobStore {
  return new MemoryJobStore();
}
