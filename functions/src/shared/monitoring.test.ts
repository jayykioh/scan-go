/**
 * Functions monitoring tests (NFR-OBS-001). Monitoring stays off without a DSN,
 * and the mocked Sentry transport receives exactly one scrubbed event with the
 * configured environment and release; secret-like values never leave.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  options: undefined as
    | {
        environment?: string;
        release?: string;
        dsn?: string;
        beforeSend?: (event: Record<string, unknown>) => Record<string, unknown>;
      }
    | undefined,
  extras: {} as Record<string, unknown>,
  events: [] as Array<Record<string, unknown>>,
}));

vi.mock('@sentry/node', () => ({
  init: (options: (typeof sentry)['options']) => {
    sentry.options = options;
  },
  withScope: (callback: (scope: { setExtras: (v: unknown) => void }) => void) =>
    callback({
      setExtras: (extras: unknown) => {
        sentry.extras = extras as Record<string, unknown>;
      },
    }),
  captureException: (error: unknown) => {
    const event: Record<string, unknown> = {
      message: error instanceof Error ? error.message : String(error),
      environment: sentry.options?.environment,
      release: sentry.options?.release,
      extra: sentry.extras,
    };
    const prepared = sentry.options?.beforeSend
      ? sentry.options.beforeSend(event)
      : event;
    sentry.events.push(prepared);
  },
}));

import {
  captureFunctionError,
  initFunctionsMonitoring,
  isFunctionsMonitoringEnabled,
} from './monitoring.js';

describe('initFunctionsMonitoring', () => {
  beforeEach(() => {
    sentry.options = undefined;
    sentry.extras = {};
    sentry.events.length = 0;
  });

  it('stays disabled without a DSN and enables with one', () => {
    expect(initFunctionsMonitoring({})).toBe(false);
    expect(isFunctionsMonitoringEnabled()).toBe(false);

    expect(
      initFunctionsMonitoring({
        SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/1',
        SENTRY_ENVIRONMENT: 'test',
      }),
    ).toBe(true);
    expect(isFunctionsMonitoringEnabled()).toBe(true);

    expect(initFunctionsMonitoring({})).toBe(false);
    expect(isFunctionsMonitoringEnabled()).toBe(false);
  });

  it('sends one scrubbed event with environment and release', () => {
    initFunctionsMonitoring({
      SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/1',
      SENTRY_ENVIRONMENT: 'staging',
      SENTRY_RELEASE: '1.2.3',
    });

    captureFunctionError(new Error('payment failed'), {
      apiKey: 'AIzaSyA1234567890abcdefghijklmnop',
      password: 'hunter2',
      reason: 'provider timeout',
    });

    expect(sentry.events).toHaveLength(1);
    const event = sentry.events[0];
    expect(event.environment).toBe('staging');
    expect(event.release).toBe('1.2.3');

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('AIzaSyA');
    expect(serialized).not.toContain('hunter2');
    expect(serialized).toContain('provider timeout');
  });
});
