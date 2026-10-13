import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearReadCache,
  invalidateReadCache,
  readCached,
  type ReadCacheKey,
} from './readCache';

const key: ReadCacheKey = {
  userId: 'user-a',
  tenantId: 'tenant-a',
  path: 'tenants/tenant-a/dailyStats',
  query: 'from=20261001;to=20261007;limit=7',
};

beforeEach(() => clearReadCache());

describe('shared read cache', () => {
  it('deduplicates concurrent reads and reuses the resolved value', async () => {
    let resolveLoad: ((value: string[]) => void) | undefined;
    const loader = vi.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const first = readCached(key, loader);
    const second = readCached(key, loader);
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);
    resolveLoad?.(['cached']);
    await expect(first).resolves.toEqual(['cached']);
    await expect(second).resolves.toEqual(['cached']);
    await expect(readCached(key, loader)).resolves.toEqual(['cached']);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('isolates identity/tenant/query keys and invalidates matching scope', async () => {
    const loader = vi.fn().mockResolvedValue(['value']);
    const otherTenant = { ...key, tenantId: 'tenant-b' };
    const otherQuery = { ...key, query: 'from=20261008;to=20261014;limit=7' };

    await readCached(key, loader);
    await readCached(otherTenant, loader);
    await readCached(otherQuery, loader);
    expect(loader).toHaveBeenCalledTimes(3);

    invalidateReadCache({ userId: 'user-a', tenantId: 'tenant-a' });
    await readCached(key, loader);
    await readCached(otherTenant, loader);
    expect(loader).toHaveBeenCalledTimes(4);
  });

  it('does not repopulate an entry invalidated while its read is pending', async () => {
    let resolveLoad: ((value: string) => void) | undefined;
    const loader = () =>
      new Promise<string>((resolve) => {
        resolveLoad = resolve;
      });
    const oldRead = readCached(key, loader);
    await Promise.resolve();
    invalidateReadCache({ tenantId: 'tenant-a' });
    resolveLoad?.('stale');
    await expect(oldRead).resolves.toBe('stale');

    const freshLoader = vi.fn().mockResolvedValue('fresh');
    await expect(readCached(key, freshLoader)).resolves.toBe('fresh');
    expect(freshLoader).toHaveBeenCalledTimes(1);
  });

  it('does not cache failed reads', async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('recovered');

    await expect(readCached(key, loader)).rejects.toThrow('offline');
    await expect(readCached(key, loader)).resolves.toBe('recovered');
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
