import { ZipArchive } from "archiver";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export interface ArchiveInput {
  /** Server-generated member name (never user input). */
  name: string;
  path: string;
}

/** Server-generated member names: media-001.mp4, media-002.mp3, … */
export function archiveEntryName(index: number, ext: string): string {
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  return `media-${String(index + 1).padStart(3, "0")}.${safeExt}`;
}

function assertSafeName(name: string): void {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error(`Unsafe archive member name: ${name}`);
  }
}

/**
 * Builds a ZIP from local files. Rejects traversal/dot segments (zip-slip
 * guard) and enforces a total uncompressed cap. Caller cleans inputs.
 */
export async function buildZipArchive(
  files: ArchiveInput[],
  destPath: string,
  opts: { maxBytes: number }
): Promise<{ bytes: number; count: number }> {
  if (files.length === 0) throw new Error("Nothing to archive");
  let total = 0;
  for (const f of files) {
    assertSafeName(f.name);
    const st = await fsp.stat(f.path).catch(() => null);
    if (!st || !st.isFile() || st.size === 0) throw new Error(`Missing input: ${f.name}`);
    total += st.size;
  }
  if (total > opts.maxBytes) throw new Error("Archive exceeds size limit");
  await fsp.mkdir(path.dirname(destPath), { recursive: true, mode: 0o700 });

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(destPath);
    // store: true — members are already-compressed MP4/MP3, so DEFLATE
    // burns worker CPU for ~0% size gain. The ZIP is a container, not
    // a compression step.
    const archive = new ZipArchive({ store: true });
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    for (const f of files) {
      archive.file(f.path, { name: f.name });
    }
    void archive.finalize();
  });
  const out = await fsp.stat(destPath);
  return { bytes: out.size, count: files.length };
}
