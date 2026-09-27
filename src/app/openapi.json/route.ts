import { NextResponse } from "next/server";
import { API_SCOPES, WEBHOOK_EVENTS } from "@/lib/api/types";

/**
 * OpenAPI 3.1 for the v1 developer API, generated from the same constants
 * the routes enforce (scopes, webhook events). A test asserts every
 * documented path is actually implemented.
 */
export const OPENAPI_PATHS = [
  "/api/v1/downloads",
  "/api/v1/downloads/{id}",
  "/api/v1/downloads/{id}/cancel",
  "/api/v1/downloads/{id}/retry",
  "/api/v1/batches",
  "/api/v1/batches/{id}",
  "/api/v1/providers",
  "/api/v1/account",
  "/api/v1/usage",
  "/openapi.json",
] as const;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      openapi: "3.1.0",
      info: {
        title: "SnapFlow Developer API",
        version: "1",
        description:
          "Create downloads and batches, poll status, and receive webhooks. Async everywhere: creation returns 202 with a status_url.",
      },
      servers: [{ url: "/api/v1", description: "Same origin (a dedicated api.* domain stays compatible)" }],
      security: [{ bearerAuth: [] }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description: "API key as `Authorization: Bearer sf_live_...`. Never in query strings.",
          },
        },
        schemas: {
          error: {
            type: "object",
            required: ["error"],
            properties: {
              error: {
                type: "object",
                required: ["code", "message", "request_id"],
                properties: {
                  code: { type: "string", example: "RATE_LIMITED" },
                  message: { type: "string" },
                  request_id: { type: "string" },
                },
              },
            },
          },
          downloadCreate: {
            type: "object",
            required: ["url"],
            properties: {
              url: { type: "string", maxLength: 2048, example: "https://www.tiktok.com/@user/video/123" },
              format: {
                type: "object",
                description: "One of {kind:auto} | {kind:video,maxHeight} | {kind:audio}",
                example: { kind: "video", maxHeight: 720 },
              },
            },
          },
        },
      },
      "x-scopes": [...API_SCOPES],
      "x-webhook-events": [...WEBHOOK_EVENTS],
      paths: Object.fromEntries(
        OPENAPI_PATHS.map((p) => [
          p,
          { "x-implemented": true, description: "See docs/api for method details." },
        ])
      ),
    },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
