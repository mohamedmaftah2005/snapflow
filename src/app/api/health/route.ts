import { NextResponse } from "next/server";
import { appVersion, buildInfo } from "@/lib/config/validate";

/** Liveness: is the process alive? Cheap by design — no dependency checks. */
export async function GET(): Promise<NextResponse> {
  const v = appVersion();
  const b = buildInfo();
  return NextResponse.json({
    status: "alive",
    service: "web",
    version: v.version,
    commit: b.commit,
    buildTime: b.buildTime,
  });
}
