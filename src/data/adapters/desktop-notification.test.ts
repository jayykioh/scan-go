import { afterEach, describe, expect, it, vi } from 'vitest';
import { showDesktopNotification } from './fulfilment.adapter';

/**
 * The OS notification is a guarded side effect: an unsupported or denied
 * browser must stay silent and never throw into the notification handler
 * (REQ-NOT-001).
 */
describe('showDesktopNotification', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stays silent when the browser has no Notification API', async () => {
    vi.stubGlobal('Notification', undefined);
    await expect(showDesktopNotification('Đơn mới', 'Bàn 1')).resolves.toBe(false);
  });

  it('stays silent when the permission was not granted', async () => {
    vi.stubGlobal('Notification', { permission: 'denied' });
    await expect(showDesktopNotification('Đơn mới', 'Bàn 1')).resolves.toBe(false);
  });
});
