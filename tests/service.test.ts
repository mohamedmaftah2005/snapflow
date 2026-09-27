import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanupJobDir, jobDir } from "@/services/downloader/TikTokDownloader";
import { checkBinaryAvailable, mapYtDlpFailure, runBinary } from "@/services/downloader/ytdlp";
import { AppError } from "@/lib/errors";

describe("downloader service", () => {
  it("8. reports yt-dlp unavailable for a bogus binary", async () => {
    const ok = await checkBinaryAvailable("__definitely_not_a_binary_12345__");
    expect(ok).toBe(false);
    await expect(
      runBinary("__definitely_not_a_binary_12345__", ["--version"], { timeoutMs: 10_000 })
    ).rejects.toMatchObject({ code: "YT_DLP_UNAVAILABLE" });
  });

  it("9. enforces a process timeout", async () => {
    await expect(
      runBinary(process.execPath, ["-e", "setTimeout(()=>{}, 5000)"], { timeoutMs: 300 })
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("10. maps oversized-file failures", () => {
    const e = mapYtDlpFailure("ERROR: File is larger than max-filesize", 1);
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe("FILE_TOO_LARGE");
  });

  it("11. cleans up job dir after failure", async () => {
    const jobId = `test-cleanup-${Date.now().toString(36)}`;
    const dir = jobDir(jobId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "media.mp4"), "partial");
    await cleanupJobDir(jobId);
    await expect(fs.stat(dir)).rejects.toThrow();
    // base tmp root may remain; only job dir must be gone
    expect(os.tmpdir().length).toBeGreaterThan(0);
  });

  it("maps private/geo/unavailable errors without leaking internals", () => {
    expect(mapYtDlpFailure("ERROR: Private video", 1).code).toBe("PRIVATE_CONTENT");
    expect(mapYtDlpFailure("ERROR: Video is not available", 1).code).toBe("VIDEO_UNAVAILABLE");
    expect(mapYtDlpFailure("ERROR: blocked in your country", 1).code).toBe("GEO_RESTRICTED");
    const generic = mapYtDlpFailure("ERROR: something odd\n/home/user/secret path", 1);
    expect(generic.code).toBe("PROCESSING_FAILED");
    expect(generic.userMessage).not.toContain("/home/user");
  });
});
