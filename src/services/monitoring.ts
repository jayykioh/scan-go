import * as Sentry from '@sentry/react';
import {
  resolveMonitoringConfig,
  scrubMonitoringEvent,
  type MonitoringEnv,
} from '@shared/monitoring';

/**
 * Frontend error monitoring (NFR-OBS-001). Monitoring is disabled without
 * `VITE_SENTRY_DSN`, never sends default PII, and redacts secret-like values
 * before an event leaves the browser.
 */
export interface FrontendMonitoringEnv extends MonitoringEnv {
  MODE?: string;
  VITE_APP_RELEASE?: string;
}

let monitoringEnabled = false;

export function isMonitoringEnabled(): boolean {
  return monitoringEnabled;
}

export function initMonitoring(
  env: FrontendMonitoringEnv = import.meta.env as FrontendMonitoringEnv,
): boolean {
  const config = resolveMonitoringConfig(env, {
    dsnKey: 'VITE_SENTRY_DSN',
    environmentKey: 'VITE_SENTRY_ENVIRONMENT',
    releaseKey: 'VITE_APP_RELEASE',
    defaultEnvironment: env.MODE ?? 'development',
  });
  if (!config.dsn) {
    monitoringEnabled = false;
    return false;
  }
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release ?? undefined,
    sendDefaultPii: false,
    beforeSend: (event) =>
      scrubMonitoringEvent(event as unknown as Record<string, unknown>) as never,
  });
  monitoringEnabled = true;
  return true;
}

export function captureMonitoringError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!monitoringEnabled) {
    return;
  }
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(scrubMonitoringEvent(context));
    }
    Sentry.captureException(error);
  });
}
