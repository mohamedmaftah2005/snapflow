import { NextResponse } from "next/server";

/**
 * Public status signal for maintenance banners. No secrets, no user data:
 * full-maintenance flag plus per-provider availability. Cached flag reads
 * only (no extra latency after warm).
 */
export async function GET(): Promise<NextResponse> {
  const { maintenanceMode, providerStatus } = await import("@/lib/admin/flags");
  const { getProviderRegistry } = await import("@/lib/providers/registry");
  const maintenance = await maintenanceMode();
  const providers = getProviderRegistry()
    .all()
    .map((e) => ({ id: e.provider.id, status: providerStatus(e.provider.id) }));
  return NextResponse.json(
    { success: true, data: { maintenance, providers } },
    { headers: { "Cache-Control": "public, max-age=30" } }
  );
}
