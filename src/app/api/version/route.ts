import { NextResponse } from "next/server";
import { appVersion, buildInfo } from "@/lib/config/validate";

/** Safe build identity: version/commit/timestamp only — never secrets. */
export async function GET(): Promise<NextResponse> {
  const v = appVersion();
  const b = buildInfo();
  return NextResponse.json({
    name: v.name,
    version: v.version,
    commit: b.commit,
    buildTime: b.buildTime,
    node: process.version,
  });
}
