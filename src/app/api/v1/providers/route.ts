import { NextResponse } from "next/server";
import { requireApiKey, v1Ok } from "../_auth";
import { getProviderRegistry } from "@/lib/providers/registry";

/** GET /api/v1/providers — only enabled providers, no internals. */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requireApiKey(req, ["providers:read"]);
  if ("error" in gate) return gate.error;
  const { ctx: c } = gate;
  return v1Ok(
    {
      providers: getProviderRegistry()
        .enabled()
        .map((e) => ({
          id: e.provider.id,
          name: e.provider.name,
          capabilities: Object.entries(e.provider.capabilities)
            .filter(([, v]) => v)
            .map(([k]) => k.replace("slideshow", "carousel")),
        })),
    },
    c.requestId
  );
}
