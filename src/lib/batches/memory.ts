import type { BatchRecord, BatchStore } from "./types";

export class MemoryBatchStore implements BatchStore {
  private batches = new Map<string, BatchRecord>();
  private items = new Map<string, string[]>();

  async createBatch(b: BatchRecord): Promise<void> {
    this.batches.set(b.id, { ...b });
    this.items.set(b.id, []);
  }

  async getBatch(id: string): Promise<BatchRecord | undefined> {
    const b = this.batches.get(id);
    return b ? { ...b } : undefined;
  }

  async updateBatch(id: string, patch: Partial<BatchRecord>): Promise<void> {
    const cur = this.batches.get(id);
    if (cur) this.batches.set(id, { ...cur, ...patch });
  }

  async addItems(batchId: string, jobIds: string[]): Promise<void> {
    this.items.set(batchId, [...(this.items.get(batchId) ?? []), ...jobIds]);
  }

  async getBatchJobIds(batchId: string): Promise<string[]> {
    return [...(this.items.get(batchId) ?? [])];
  }

  async listBatchesByUser(userId: string, limit: number, offset: number): Promise<{ batches: BatchRecord[]; total: number }> {
    const all = [...this.batches.values()]
      .filter((b) => b.userId === userId)
      .sort((a, b2) => b2.createdAt - a.createdAt);
    return { batches: all.slice(offset, offset + limit).map((b) => ({ ...b })), total: all.length };
  }

  async listRecent(limit: number, offset: number): Promise<{ batches: BatchRecord[]; total: number }> {
    const all = [...this.batches.values()].sort((a, b) => b.createdAt - a.createdAt);
    return { batches: all.slice(offset, offset + limit).map((b) => ({ ...b })), total: all.length };
  }

  async getBatchesForJob(jobId: string): Promise<string[]> {
    const out: string[] = [];
    for (const [batchId, ids] of this.items) {
      if (ids.includes(jobId)) out.push(batchId);
    }
    return out;
  }
}

let shared: MemoryBatchStore | null = null;

export function getMemoryBatchStore(): MemoryBatchStore {
  if (!shared) shared = new MemoryBatchStore();
  return shared;
}
