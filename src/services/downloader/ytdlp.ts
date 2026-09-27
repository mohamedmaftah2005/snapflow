import { spawn } from "node:child_process";
import { AppError } from "@/lib/errors";

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

const MAX_OUTPUT_BYTES = 8 * 1024 * 1024; // 8 MB cap for JSON/stdout

export function mapYtDlpFailure(stderr: string, exitCode: number | null): AppError {
  const s = stderr.toLowerCase();
  if (s.includes("private") || s.includes("login required")) {
    return new AppError("PRIVATE_CONTENT");
  }
  if (s.includes("not available") || s.includes("removed") || s.includes("deleted") || s.includes("404")) {
    return new AppError("VIDEO_UNAVAILABLE");
  }
  if (s.includes("geo") || s.includes("blocked in your country") || s.includes("not available in your country")) {
    return new AppError("GEO_RESTRICTED");
  }
  if (s.includes("file is larger than") || s.includes("file too large")) {
    return new AppError("FILE_TOO_LARGE");
  }
  if (s.includes("timed out") || exitCode === 124) return new AppError("TIMEOUT");
  return new AppError("PROCESSING_FAILED");
}

/**
 * Safe execution: binary + argv passed separately, shell:false (default).
 * Never interpolate user input into a shell string.
 */
export function runBinary(
  bin: string,
  args: string[],
  opts: { timeoutMs: number; cwd?: string }
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let settled = false;

    let child;
    try {
      child = spawn(bin, args, { shell: false, cwd: opts.cwd, windowsHide: true });
    } catch (err) {
      reject(err);
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      reject(new AppError("TIMEOUT", "External process timed out"));
    }, opts.timeoutMs);

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(new AppError("YT_DLP_UNAVAILABLE", `Binary not found: ${bin}`));
      } else {
        reject(err);
      }
    });

    child.stdout?.on("data", (d: Buffer) => {
      stdoutBytes += d.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore
          }
          reject(new AppError("FILE_TOO_LARGE", "Process output exceeded limit"));
        }
        return;
      }
      stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      if (stderr.length < 32 * 1024) stderr += d.toString("utf8");
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

const probeCache = new Map<string, Promise<boolean>>();

/**
 * Cached availability probe. Binaries don't appear/disappear mid-process
 * in production; without this cache every audio job spawned an extra
 * `ffmpeg -version` process. The worker --healthcheck still verifies
 * binaries independently at startup.
 */
export async function checkBinaryAvailable(bin: string, versionArgs = ["--version"]): Promise<boolean> {
  const key = `${bin} ${versionArgs.join(" ")}`;
  let pending = probeCache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const r = await runBinary(bin, versionArgs, { timeoutMs: 15_000 });
        return r.exitCode === 0;
      } catch {
        return false;
      }
    })();
    probeCache.set(key, pending);
  }
  return pending;
}

/** Test-only reset for the probe cache. */
export function __resetProbeCache(): void {
  probeCache.clear();
}
