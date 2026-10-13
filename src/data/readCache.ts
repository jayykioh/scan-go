export interface ReadCacheKey {
  userId: string;
  tenantId: string;
  /** Firestore document or collection path. */
  path: string;
  /** Stable serialization of filters, ordering, bounds, and other query inputs. */
  query: string;
}

export interface ReadCacheScope {
  userId?: string;
  tenantId?: string;
  pathPrefix?: string;
}

interface Entry extends ReadCacheKey {
  hasValue: boolean;
  value?: unknown;
  pending?: Promise<unknown>;
}

const MAX_ENTRIES = 200;
const entries = new Map<string, Entry>();

function serialize(key: ReadCacheKey): string {
  return JSON.stringify([key.userId, key.tenantId, key.path, key.query]);
}

function touch(id: string, entry: Entry): void {
  entries.delete(id);
  entries.set(id, entry);
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) return;
    entries.delete(oldest);
  }
}

/**
 * Cache a bounded read and deduplicate concurrent requests. The complete key
 * includes authenticated user, tenant, Firestore path, and query parameters.
 */
export function readCached<T>(
  key: ReadCacheKey,
  loader: () => Promise<T>,
): Promise<T> {
  const id = serialize(key);
  let entry = entries.get(id);
  if (entry?.hasValue) {
    touch(id, entry);
    return Promise.resolve(entry.value as T);
  }
  if (entry?.pending) {
    touch(id, entry);
    return entry.pending as Promise<T>;
  }
  if (!entry) {
    entry = { ...key, hasValue: false };
    entries.set(id, entry);
  }

  const currentEntry = entry;
  const pending = Promise.resolve()
    .then(loader)
    .then((value) => {
      if (entries.get(id) === currentEntry) {
        currentEntry.value = value;
        currentEntry.hasValue = true;
        currentEntry.pending = undefined;
        touch(id, currentEntry);
      }
      return value;
    })
    .catch((error: unknown) => {
      if (entries.get(id) === currentEntry) {
        entries.delete(id);
      }
      throw error;
    });
  currentEntry.pending = pending;
  touch(id, currentEntry);
  return pending;
}

/** Invalidate cache entries after a successful server command or refresh. */
export function invalidateReadCache(scope: ReadCacheScope = {}): void {
  for (const [id, entry] of entries) {
    if (
      (scope.userId === undefined || scope.userId === entry.userId) &&
      (scope.tenantId === undefined || scope.tenantId === entry.tenantId) &&
      (scope.pathPrefix === undefined || entry.path.startsWith(scope.pathPrefix))
    ) {
      entries.delete(id);
    }
  }
}

/** Clear all app-lifetime cached reads when auth/tenant/role context changes. */
export function clearReadCache(): void {
  entries.clear();
}
