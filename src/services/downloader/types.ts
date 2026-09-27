export interface MediaMetadata {
  id: string;
  title?: string;
  description?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  sourceUrl: string;
}

export interface MediaDownloadResult {
  jobId: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  format: string;
  container: string;
  resolution?: string;
  filesize?: number;
  fileId: string;
  downloadUrl: string;
  expiresAt: string;
}

export interface MediaDownloader {
  supports(url: URL): boolean;
  getMetadata(normalizedUrl: string): Promise<MediaMetadata>;
  download(normalizedUrl: string, jobId: string): Promise<MediaDownloadResult>;
}
