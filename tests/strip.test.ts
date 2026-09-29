import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripMetadataArgs, stripOneFile } from "@/lib/media/strip";

describe("metadata strip: fixed argv", () => {
  it("builds a shell-free remux command", () => {
    expect(stripMetadataArgs("in.mp4", "out.mp4")).toEqual([
      "-y", "-v", "error", "-i", "in.mp4",
      "-map_metadata", "-1", "-c", "copy", "out.mp4",
    ]);
  });

  it("keeps hostile paths as inert argv elements", () => {
    const evil = "a; rm -rf /.mp4";
    const args = stripMetadataArgs(evil, "out.mp4");
    expect(args).toContain(evil);
    expect(args.join(" ")).not.toContain("rm -rf / ");
  });
});

describe("metadata strip: best-effort file handling", () => {
  async function tmpFile(content: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "strip-test-"));
    const p = path.join(dir, "media.mp4");
    await fs.writeFile(p, content);
    return p;
  }

  it("keeps the original when ffmpeg is unavailable", async () => {
    const p = await tmpFile("bytes");
    let ran = 0;
    const out = await stripOneFile(
      { jobId: "j", localPath: p },
      {
        ffmpegPath: "ffmpeg",
        timeoutMs: 1000,
        checkBinary: async () => false,
        run: async () => {
          ran += 1;
          return { exitCode: 0 };
        },
      }
    );
    expect(out.localPath).toBe(p);
    expect(ran).toBe(0);
    expect(await fs.readFile(p, "utf8")).toBe("bytes");
  });

  it("replaces the file on success and reports the new size", async () => {
    const p = await tmpFile("original-bytes-here");
    const out = await stripOneFile(
      { jobId: "j", localPath: p },
      {
        ffmpegPath: "ffmpeg",
        timeoutMs: 1000,
        checkBinary: async () => true,
        // Fake ffmpeg: last argv element is the output path.
        run: async (_bin, args) => {
          await fs.writeFile(args[args.length - 1] as string, "clean");
          return { exitCode: 0 };
        },
      }
    );
    expect(out.localPath).toBe(p);
    expect(out.filesize).toBe(5);
    expect(await fs.readFile(p, "utf8")).toBe("clean");
  });

  it("keeps the original when ffmpeg fails", async () => {
    const p = await tmpFile("untouched");
    const out = await stripOneFile(
      { jobId: "j", localPath: p },
      {
        ffmpegPath: "ffmpeg",
        timeoutMs: 1000,
        checkBinary: async () => true,
        run: async () => ({ exitCode: 1 }),
      }
    );
    expect(out.localPath).toBe(p);
    expect(await fs.readFile(p, "utf8")).toBe("untouched");
  });

  it("keeps missing paths without throwing", async () => {
    const missing = path.join(os.tmpdir(), "strip-test-nope", "gone.mp4");
    const out = await stripOneFile(
      { jobId: "j", localPath: missing },
      {
        ffmpegPath: "ffmpeg",
        timeoutMs: 1000,
        checkBinary: async () => true,
        run: async () => ({ exitCode: 0 }),
      }
    );
    expect(out.localPath).toBe(missing);
  });
});
