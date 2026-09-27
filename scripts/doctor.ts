#!/usr/bin/env tsx
/**
 * Preflight doctor: env validation + binaries + DB/Redis/storage reachability.
 * Exit 0 = deployable, 1 = blocking issues. Never prints secret values.
 * Usage: npm run doctor (APP_ENV=production npm run doctor)
 */
import { env } from "@/lib/config/env";
import { appEnv, validateEnv } from "@/lib/config/validate";
import { checkBinaryAvailable } from "@/services/downloader/ytdlp";
import { checkReadiness } from "@/lib/health";

async function main(): Promise<void> {
  const target = appEnv();
  let failed = false;
  console.log(`env: ${target}`);

  for (const issue of validateEnv(process.env as Record<string, string | undefined>, target)) {
    console.log(`env MISSING/INVALID: ${issue.variable} — ${issue.problem}`);
    failed = true;
  }
  if (failed && target === "production") {
    console.log("doctor: FAIL (refusing to start with incomplete production config)");
    process.exit(1);
  }

  const ytdlp = await checkBinaryAvailable(env.ytDlpPath);
  const ffmpeg = await checkBinaryAvailable(env.ffmpegPath, ["-version"]);
  console.log(`yt-dlp: ${ytdlp ? "ok" : "MISSING"} (${env.ytDlpPath})`);
  console.log(`ffmpeg: ${ffmpeg ? "ok" : "MISSING"} (${env.ffmpegPath})`);

  const { ready, checks } = await checkReadiness();
  console.log(`readiness: ${ready ? "ready" : "NOT READY"} ${JSON.stringify(checks)}`);
  if (!ready && target === "production") {
    console.log("doctor: FAIL (dependencies unreachable)");
    process.exit(1);
  }
  if (target === "production") {
    // Launch blocker (manual): the default EmailService only logs.
    // Verification, reset, and billing emails never deliver until a
    // production driver is wired in src/lib/email.ts.
    console.log("email: WARN (log-only driver — wire a production EmailService before launch; see docs/launch-runbook.md)");
  }
  console.log(`doctor: ${failed ? "WARN" : "OK"}`);
}

main().catch((err) => {
  console.error(`doctor: ERROR ${String(err).slice(0, 200)}`);
  process.exit(1);
});
