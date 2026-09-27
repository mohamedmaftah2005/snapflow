import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ObjectStorage, UploadInput } from "./types";

/**
 * Local driver: keeps bytes on this machine's temp dir so the existing
 * GET /api/files/[id] endpoint can serve them. Dev/test only.
 * Production uses the S3 driver.
 */
export class LocalObjectStorage implements ObjectStorage {
  readonly kind = "local";
  private root: string;

  constructor(root?: string) {
    this.root = root ?? path.join(os.tmpdir(), "snapflow");
  }

  private resolve(key: string): string {
    // Keys are server-generated (buildObjectKey), but resolve defensively anyway.
    const rel = key.replace(/\\/g, "/").replace(/^\/+/, "");
    const full = path.resolve(this.root, rel);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error("Unsafe storage key");
    }
    return full;
  }

  async upload(input: UploadInput): Promise<void> {
    const dest = this.resolve(input.key);
    await fs.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
    await fs.copyFile(input.filePath, dest);
  }

  async getSignedUrl(key: string): Promise<string> {
    // Local driver has no presigning; the web layer maps keys to /api/files.
    // Return the key so callers can route it; never a filesystem path.
    return key;
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true }).catch(() => undefined);
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    await fs.mkdir(path.dirname(destPath), { recursive: true, mode: 0o700 });
    await fs.copyFile(this.resolve(key), destPath);
  }

  /** Local-driver only: resolve a key for direct serving. Keys stay server-built. */
  localPathFor(key: string): string {
    return this.resolve(key);
  }
}
