import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectStorage, UploadInput } from "./types";

export interface S3Config {
  endpoint?: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  signedUrlTtlSeconds: number;
  forcePathStyle?: boolean;
}

/** Private-bucket driver. Files stay private; browsers get short-lived signed URLs. */
export class S3ObjectStorage implements ObjectStorage {
  readonly kind = "s3";
  private client: S3Client;
  private bucket: string;
  private ttl: number;

  constructor(cfg: S3Config) {
    this.bucket = cfg.bucket;
    this.ttl = cfg.signedUrlTtlSeconds;
    this.client = new S3Client({
      endpoint: cfg.endpoint || undefined,
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle ?? Boolean(cfg.endpoint),
      credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    });
  }

  async upload(input: UploadInput): Promise<void> {
    const body = fs.createReadStream(input.filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: body,
        ContentType: input.contentType,
      })
    );
  }

  async getSignedUrl(key: string): Promise<string> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: this.ttl }
    );
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error("Empty object");
    await fsp.mkdir(path.dirname(destPath), { recursive: true, mode: 0o700 });
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(destPath);
      (res.Body as NodeJS.ReadableStream).pipe(out);
      out.on("finish", () => resolve());
      out.on("error", reject);
    });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}
