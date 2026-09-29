import fs from "node:fs/promises";
import path from "node:path";

/**
 * Container-level metadata strip (title, encoder tags, creation time,
 * location atoms, …) via a lossless stream-copy remux — no re-encode,
 * no quality change, new file hash.
 *
 * Honest scope: this removes embedded tags only. It does not transfer
 * ownership, remove watermarks, or defeat perceptual-hash duplicate
 * detection. Only download content you have the right to save.
 */

/** Fixed ffmpeg argv. Paths travel as argv elements, never a shell string. */
export function stripMetadataArgs(inputPath: string, outputPath: string): string[] {
  return ["-y", "-v", "error", "-i", inputPath, "-map_metadata", "-1", "-c", "copy", outputPath];
}

export interface StripInput {
  jobId: string;
  localPath: string;
}

export interface StripDeps {
  ffmpegPath: string;
  timeoutMs: number;
  checkBinary: (bin: string, args?: string[]) => Promise<boolean>;
  run: (bin: string, args: string[], opts: { timeoutMs: number }) => Promise<{ exitCode: number | null }>;
}

/**
 * Best-effort strip for one file. Returns the (possibly unchanged) path
 * and current size. Never throws: any failure keeps the original file so
 * a strip problem can never fail a download.
 */
export async function stripOneFile(
  input: StripInput,
  deps: StripDeps
): Promise<{ localPath: string; filesize?: number }> {
  const { localPath } = input;
  try {
    if (!(await deps.checkBinary(deps.ffmpegPath, ["-version"]))) return { localPath };
    const st = await fs.stat(localPath).catch(() => null);
    if (!st || !st.isFile() || st.size === 0) return { localPath };
    const dir = path.dirname(localPath);
    const base = path.basename(localPath);
    const tmp = path.join(dir, `.stripped-${process.pid}-${Date.now()}-${base}`);
    const r = await deps.run(deps.ffmpegPath, stripMetadataArgs(localPath, tmp), {
      timeoutMs: deps.timeoutMs,
    });
    if (r.exitCode !== 0) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      return { localPath, filesize: st.size };
    }
    const out = await fs.stat(tmp).catch(() => null);
    if (!out || !out.isFile() || out.size === 0) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      return { localPath, filesize: st.size };
    }
    await fs.rename(tmp, localPath);
    return { localPath, filesize: out.size };
  } catch {
    return { localPath };
  }
}
