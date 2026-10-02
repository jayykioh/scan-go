/**
 * Monitoring helper tests (NFR-OBS-001).
 *
 * Monitoring is disabled without a DSN, and secret-like keys or values are
 * redacted before an event can leave the process.
 */
import { describe, expect, it } from 'vitest';
import {
  REDACTED,
  redactSecretsInString,
  resolveMonitoringConfig,
  scrubMonitoringEvent,
} from './monitoring.js';

const FRONTEND_KEYS = {
  dsnKey: 'VITE_SENTRY_DSN',
  environmentKey: 'VITE_SENTRY_ENVIRONMENT',
  releaseKey: 'VITE_APP_RELEASE',
  defaultEnvironment: 'development',
};

describe('resolveMonitoringConfig', () => {
  it('disables monitoring when the DSN is missing or blank', () => {
    expect(resolveMonitoringConfig({}, FRONTEND_KEYS).dsn).toBeNull();
    expect(
      resolveMonitoringConfig({ VITE_SENTRY_DSN: '   ' }, FRONTEND_KEYS).dsn,
    ).toBeNull();
  });

  it('reads a DSN and environment when present', () => {
    const config = resolveMonitoringConfig(
      {
        VITE_SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/1',
        VITE_SENTRY_ENVIRONMENT: 'production',
        VITE_APP_RELEASE: '1.2.3',
      },
      FRONTEND_KEYS,
    );
    expect(config.dsn).toBe('https://abc@o1.ingest.sentry.io/1');
    expect(config.environment).toBe('production');
    expect(config.release).toBe('1.2.3');
  });
});

describe('scrubMonitoringEvent', () => {
  it('redacts sensitive keys and secret-like values', () => {
    const scrubbed = scrubMonitoringEvent({
      message: 'login failed',
      request: { data: { password: 'hunter2', pin: '123456' } },
      extra: { apiKey: 'AIzaSyA1234567890abcdefghijklmnop' },
      headers: { Authorization: 'Bearer abcdefghijklmnop' },
    });

    const serialized = JSON.stringify(scrubbed);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('123456');
    expect(serialized).not.toContain('AIzaSyA');
    expect(serialized).not.toContain('abcdefghijklmnop');
    expect(serialized).toContain(REDACTED);
  });

  it('redacts a secret embedded in an unrelated string', () => {
    expect(redactSecretsInString('key=AIzaSyA1234567890abcdefghijklmnop')).toBe(
      'key=[redacted]',
    );
  });

  it('keeps ordinary values intact', () => {
    expect(
      scrubMonitoringEvent({ message: 'ok', count: 3, nested: { ok: true } }),
    ).toEqual({ message: 'ok', count: 3, nested: { ok: true } });
  });
});
