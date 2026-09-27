import { Pool } from "pg";
import { env } from "@/lib/config/env";

export interface PoolOptions {
  /** Store name for logs, e.g. "jobs". */
  name: string;
  /** Max connections; per-store default preserves the audited budget. */
  max: number;
}

/**
 * Centralized pool construction. Every store gets: bounded connections,
 * idle eviction, connection timeout, statement timeout, and slow-query
 * logging (query text truncated, parameters NEVER logged).
 *
 * Total budget stays 19 connections/process (5+5+3+3+3) unless a store
 * default changes — see docs/performance-audit.md §1.
 */
export function createPool(connectionString: string, opts: PoolOptions): Pool {
  const pool = new Pool({
    connectionString,
    max: opts.max,
    idleTimeoutMillis: env.dbIdleTimeoutMs,
    connectionTimeoutMillis: env.dbConnectionTimeoutMs,
    statement_timeout: env.dbStatementTimeoutMs,
  });
  pool.on("error", (err) => {
    console.error(JSON.stringify({ event: "pg_pool_error", store: opts.name, message: String(err) }));
  });

  // Slow-query instrumentation without touching every call site.
  const rawQuery = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
  const threshold = env.dbSlowQueryMs;
  pool.query = ((...args: unknown[]) => {
    const started = Date.now();
    const first = args[0] as string | { text?: string } | undefined;
    const text = typeof first === "string" ? first : String(first?.text ?? "unknown");
    const p = rawQuery(...args);
    return p.then(
      (res) => {
        const ms = Date.now() - started;
        if (ms >= threshold) {
          console.warn(JSON.stringify({
            event: "slow_query",
            store: opts.name,
            durationMs: ms,
            query: text.replace(/\s+/g, " ").slice(0, 300),
          }));
        }
        return res;
      },
      (err: unknown) => {
        const ms = Date.now() - started;
        console.warn(JSON.stringify({
          event: "query_error",
          store: opts.name,
          durationMs: ms,
          query: text.replace(/\s+/g, " ").slice(0, 300),
          message: String(err).slice(0, 200),
        }));
        throw err;
      }
    );
  }) as Pool["query"];
  return pool;
}
