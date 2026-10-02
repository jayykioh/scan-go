import * as Sentry from '@sentry/node';
import {
  resolveMonitoringConfig,
  scrubMonitoringEvent,
  type MonitoringEnv,
} from '../../../shared/monitoring.js';

/**
 * Cloud Functions error monitoring (NFR-OBS-001). Monitoring is disabled
 * without `SENTRY_DSN`, never sends default PII, and redacts secret-like values
 * before an event leaves the process. The DSN itself is never logged.
 */
let monitoringEnabled = false;

export function isFunctionsMonitoringEnabled(): boolean {
  return monitoringEnabled;
}

export function initFunctionsMonitoring(
  env: MonitoringEnv = process.env,
): boolean {
  const config = resolveMonitoringConfig(env, {
    dsnKey: 'SENTRY_DSN',
    environmentKey: 'SENTRY_ENVIRONMENT',
    releaseKey: 'SENTRY_RELEASE',
    defaultEnvironment: env.NODE_ENV ?? 'production',
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

export function captureFunctionError(
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
