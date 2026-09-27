/**
 * Tiny TTL cache for expensive read-only aggregates (admin dashboards).
 * In-process, single-flight, bounded size. Callers MUST include `cachedAt`
 * in responses so UIs can show staleness ("Updated X ago") instead of
 * implying real-time data. Never used for auth, billing state, or
 * per-user data — aggregates only.
 */
interface Entry<T> {
  value: T;
  expiresAt: number;
  promise: Promise<T> | null;
}

const MAX_ENTRIES = 200;
const store = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<{ value: T; cachedAt: number; hit: boolean }> {
  const now = Date.now();
  const existing = store.get(key) as Entry<T> | undefined;
  if (existing && existing.expiresAt > now && existing.promise === null) {
    return { value: existing.value, cachedAt: existing.expiresAt - ttlMs, hit: true };
  }
  if (existing?.promise) {
    const value = await existing.promise;
    return { value, cachedAt: existing.expiresAt - ttlMs, hit: true };
  }
  if (store.size >= MAX_ENTRIES) {
    // Evict expired entries first, then oldest.
    for (const [k, e] of store) {
      if (e.expiresAt <= now) store.delete(k);
      if (store.size < MAX_ENTRIES) break;
    }
    if (store.size >= MAX_ENTRIES) {
      const oldest = store.keys().next();
      if (!oldest.done) store.delete(oldest.value);
    }
  }
  const entry: Entry<T> = { value: undefined as T, expiresAt: 0, promise: null };
  store.set(key, entry as Entry<unknown>);
  entry.promise = fn();
  try {
    entry.value = await entry.promise;
    entry.expiresAt = Date.now() + ttlMs;
    return { value: entry.value, cachedAt: Date.now(), hit: false };
  } finally {
    entry.promise = null;
  }
}

/** Test-only reset. */
export function __resetCache(): void {
  store.clear();
}
