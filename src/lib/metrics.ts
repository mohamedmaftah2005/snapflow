/**
 * Minimal in-process metrics (single instance view).
 * Multi-instance deployments should scrape each replica or forward to a
 * collector — documented in docs/runbook.md. Never exposed publicly:
 * GET /api/metrics requires METRICS_TOKEN.
 *
 * Cardinality guard: dynamic series (e.g. per-provider counters) are
 * capped — beyond MAX_SERIES new names are dropped and counted once, so
 * a runaway label space cannot OOM the process.
 */
const counters = new Map<string, number>();
const durations = new Map<string, { sum: number; count: number }>();

const MAX_SERIES = 5000;
let droppedSeries = 0;

function admissible(store: Map<string, unknown>, name: string): boolean {
  if (store.has(name)) return true;
  if (store.size < MAX_SERIES) return true;
  droppedSeries += 1;
  return false;
}

export function inc(name: string, by = 1): void {
  if (!admissible(counters, name)) return;
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export function observe(name: string, ms: number): void {
  if (!admissible(durations, name)) return;
  const e = durations.get(name) ?? { sum: 0, count: 0 };
  e.sum += ms;
  e.count += 1;
  durations.set(name, e);
}

export function renderPrometheus(): string {
  const lines: string[] = [];
  for (const [k, v] of [...counters.entries()].sort()) {
    lines.push(`# TYPE snapflow_${k} counter`);
    lines.push(`snapflow_${k} ${v}`);
  }
  for (const [k, { sum, count }] of [...durations.entries()].sort()) {
    lines.push(`# TYPE snapflow_${k}_ms_sum counter`);
    lines.push(`snapflow_${k}_ms_sum ${Math.round(sum)}`);
    lines.push(`# TYPE snapflow_${k}_ms_count counter`);
    lines.push(`snapflow_${k}_ms_count ${count}`);
  }
  if (droppedSeries > 0) {
    lines.push(`# TYPE snapflow_dropped_series counter`);
    lines.push(`snapflow_dropped_series ${droppedSeries}`);
  }
  return lines.join("\n") + "\n";
}

/** Test-only reset. */
export function __resetMetrics(): void {
  counters.clear();
  durations.clear();
  droppedSeries = 0;
}
