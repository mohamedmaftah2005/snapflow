import { env } from "@/lib/config/env";

/** Log levels: development may use DEBUG; production defaults to INFO. */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const ORDER: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

function activeLevel(): LogLevel {
  const v = (env.logLevel ?? "info").toUpperCase();
  if (v === "DEBUG" || v === "INFO" || v === "WARN" || v === "ERROR") return v;
  return "INFO";
}

function emit(level: LogLevel, fields: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[activeLevel()]) return;
  const line = { ts: new Date().toISOString(), level, ...fields };
  if (level === "ERROR" || level === "WARN") console.error(JSON.stringify(line));
  else console.log(JSON.stringify(line));
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("DEBUG", { event, ...(fields ?? {}) }),
  info: (event: string, fields?: Record<string, unknown>) => emit("INFO", { event, ...(fields ?? {}) }),
  warn: (event: string, fields?: Record<string, unknown>) => emit("WARN", { event, ...(fields ?? {}) }),
  error: (event: string, fields?: Record<string, unknown>) => emit("ERROR", { event, ...(fields ?? {}) }),
};

function sanitizeUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return "[unparseable-url]";
  }
}

/** Legacy signature kept for existing callers: log(jobId, stage, extra). */
export function log(jobId: string, stage: string, extra?: Record<string, unknown>): void {
  emit("INFO", { job: jobId, stage, ...(extra ?? {}) });
}

export function sanitizeForLog(url: string): string {
  return sanitizeUrlForLog(url);
}
