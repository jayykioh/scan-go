import { describe, expect, it } from 'vitest';
import { resolveTableListView } from './tableListView';

const base = {
  tenantId: 'tenant-1',
  loading: false,
  rowCount: 0,
  error: null,
};

describe('resolveTableListView', () => {
  it('waits while the tenant context is still resolving', () => {
    expect(resolveTableListView({ ...base, tenantId: null })).toBe('loading');
  });

  it('waits while the slice is loading', () => {
    expect(resolveTableListView({ ...base, loading: true })).toBe('loading');
  });

  it('reports an error only after loading settles', () => {
    expect(
      resolveTableListView({ ...base, loading: true, error: 'permission denied' }),
    ).toBe('loading');
    expect(resolveTableListView({ ...base, error: 'permission denied' })).toBe(
      'error',
    );
  });

  it('reports empty only when the shop really has no tables', () => {
    expect(resolveTableListView(base)).toBe('empty');
  });

  it('keeps already-read rows on screen instead of flashing a spinner', () => {
    expect(resolveTableListView({ ...base, rowCount: 3, loading: true })).toBe(
      'list',
    );
    expect(
      resolveTableListView({ ...base, rowCount: 1, error: 'boom' }),
    ).toBe('list');
  });
});
