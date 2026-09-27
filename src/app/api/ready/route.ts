import { NextResponse } from "next/server";
import { checkReadiness } from "@/lib/health";

/** Readiness: can this instance safely receive traffic? 200/503. */
export async function GET(): Promise<NextResponse> {
  const { ready, checks } = await checkReadiness();
  return NextResponse.json(
    { status: ready ? "ready" : "not-ready", checks },
    { status: ready ? 200 : 503 }
  );
}
