import { describe, expect, it, vi } from 'vitest';
import {
  createActiveTenantContext,
  type ActiveTenantContextListener,
  type Unsubscribe,
} from './tenant.adapter';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';

/**
 * P0-003 unit evidence (REQ-TEN-001): a Tenant switch replaces the whole active
 * context and disposes the prior bounded listener before the next one opens.
 */
describe('createActiveTenantContext', () => {
  it('opens one bounded listener for the selected Tenant', () => {
    const dispose = vi.fn();
    const open = vi.fn<(id: string, l: ActiveTenantContextListener) => Unsubscribe>(
      () => dispose,
    );
    const listener: ActiveTenantContextListener = () => undefined;

    const handle = createActiveTenantContext(open, listener);
    expect(handle.hasActiveListener()).toBe(false);

    handle.select(TENANT_A);

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(TENANT_A, listener);
    expect(dispose).not.toHaveBeenCalled();
    expect(handle.hasActiveListener()).toBe(true);
  });

  it('disposes the prior listener before replacing the active context', () => {
    const order: string[] = [];
    const open = vi.fn<(id: string, l: ActiveTenantContextListener) => Unsubscribe>(
      (id) => {
        order.push(`open:${id}`);
        return () => order.push(`dispose:${id}`);
      },
    );
    const listener: ActiveTenantContextListener = () => undefined;

    const handle = createActiveTenantContext(open, listener);
    handle.select(TENANT_A);
    handle.select(TENANT_B);

    expect(order).toEqual([
      `open:${TENANT_A}`,
      `dispose:${TENANT_A}`,
      `open:${TENANT_B}`,
    ]);
    expect(handle.hasActiveListener()).toBe(true);
  });

  it('disposes the current listener and stays inert when disposed twice', () => {
    const dispose = vi.fn();
    const open = vi.fn<(id: string, l: ActiveTenantContextListener) => Unsubscribe>(
      () => dispose,
    );
    const handle = createActiveTenantContext(open, () => undefined);

    handle.select(TENANT_A);
    handle.dispose();
    handle.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(handle.hasActiveListener()).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });
});
