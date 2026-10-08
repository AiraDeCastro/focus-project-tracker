/**
 * Small in-memory cache with a time limit. It only lives as long as one server instance, which
 * is enough to keep a page load from repeating the same GitHub requests; the database holds
 * anything that must last.
 */
export class TtlCache {
  private entries = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(
    private ttlMs: number,
    private now: () => number = Date.now,
  ) {}

  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.value as T;
    const value = await load();
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    return value;
  }

  clear() {
    this.entries.clear();
  }
}
