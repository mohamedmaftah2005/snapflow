export interface UploadInput {
  /** Server-generated key, e.g. downloads/<jobId>/<fileId>.mp4 */
  key: string;
  contentType: string;
  /** Local temp file to upload. Deleted by the caller after upload. */
  filePath: string;
}

export interface ObjectStorage {
  readonly kind: string;
  upload(input: UploadInput): Promise<void>;
  /** Short-lived access URL. Must expire — never indefinite. */
  getSignedUrl(key: string): Promise<string>;
  remove(key: string): Promise<void>;
  /** Fetch an object to a local path (for archive staging). */
  downloadToFile(key: string, destPath: string): Promise<void>;
}

/** Safe key builder. jobId must already be validated; fileId is server-generated. */
export function buildObjectKey(jobId: string, fileId: string): string {
  const safeJob = jobId.replace(/[^A-Za-z0-9_-]/g, "");
  const safeFile = fileId.replace(/[^A-Za-z0-9_-]/g, "");
  return `downloads/${safeJob}/${safeFile}.mp4`;
}
