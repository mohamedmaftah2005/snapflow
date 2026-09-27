export type BatchStatus =
  | "QUEUED"
  | "PROCESSING"
  | "PARTIALLY_COMPLETED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED"
  | "EXPIRED";

export interface BatchRecord {
  id: string;
  userId?: string;
  guestKey?: string;
  status: BatchStatus;
  formatKind: "auto" | "video" | "audio";
  formatHeight?: number;
  archiveKey?: string;
  archiveSize?: number;
  archiveExpires?: number;
  createdAt: number;
  completedAt?: number;
}

export interface BatchProgress {
  id: string;
  status: BatchStatus;
  total: number;
  completed: number;
  failed: number;
  processing: number;
  canceled: number;
  archiveUrl?: string;
}

export interface BatchStore {
  createBatch(b: BatchRecord): Promise<void>;
  getBatch(id: string): Promise<BatchRecord | undefined>;
  updateBatch(id: string, patch: Partial<BatchRecord>): Promise<void>;
  addItems(batchId: string, jobIds: string[]): Promise<void>;
  getBatchJobIds(batchId: string): Promise<string[]>;
  listBatchesByUser(userId: string, limit: number, offset: number): Promise<{ batches: BatchRecord[]; total: number }>;
  listRecent(limit: number, offset: number): Promise<{ batches: BatchRecord[]; total: number }>;
  /** Batch ids containing a job (for completion fan-out). */
  getBatchesForJob(jobId: string): Promise<string[]>;
}
