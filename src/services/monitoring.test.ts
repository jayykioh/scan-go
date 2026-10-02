/**
 * Frontend monitoring tests (NFR-OBS-001). Monitoring stays off without a DSN.
 */
import { describe, expect, it } from 'vitest';
import { initMonitoring, isMonitoringEnabled } from './monitoring';

describe('initMonitoring', () => {
  it('stays disabled without a DSN and enables with one', () => {
    expect(initMonitoring({})).toBe(false);
    expect(isMonitoringEnabled()).toBe(false);

    expect(
      initMonitoring({
        VITE_SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/1',
        MODE: 'test',
      }),
    ).toBe(true);
    expect(isMonitoringEnabled()).toBe(true);

    expect(initMonitoring({ VITE_SENTRY_DSN: '   ' })).toBe(false);
    expect(isMonitoringEnabled()).toBe(false);
  });
});
