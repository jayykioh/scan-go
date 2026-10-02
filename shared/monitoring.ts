/**
 * Monitoring configuration helpers (NFR-OBS-001).
 *
 * The SDK wrappers in the frontend and Cloud Functions use these pure helpers.
 * Monitoring is disabled without a DSN and safe by default: personal data stays
 * off, and secret-like values are redacted before an event leaves the process.
 */
export interface MonitoringConfig {
  dsn: string | null;
  environment: string;
  release: string | null;
}

export interface MonitoringEnv {
  [key: string]: string | undefined;
}

export interface MonitoringKeyOptions {
  dsnKey: string;
  environmentKey: string;
  releaseKey: string;
  defaultEnvironment: string;
}

const SECRET_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z_-]{20,}/g,
  /sk-[A-Za-z0-9]{16,}/g,
  /Bearer\s+[A-Za-z0-9._-]{10,}/gi,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];

const SENSITIVE_KEY_PATTERN =
  /(pass(word)?|secret|token|api[_-]?key|authorization|cookie|pin|credential|private[_-]?key|dsn)/i;

export const REDACTED = '[redacted]';

function readValue(env: MonitoringEnv, key: string): string | null {
  const raw = env[key];
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A missing or blank DSN disables monitoring completely. */
export function resolveMonitoringConfig(
  env: MonitoringEnv,
  options: MonitoringKeyOptions,
): MonitoringConfig {
  return {
    dsn: readValue(env, options.dsnKey),
    environment:
      readValue(env, options.environmentKey) ?? options.defaultEnvironment,
    release: readValue(env, options.releaseKey),
  };
}

export function redactSecretsInString(value: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, REDACTED),
    value,
  );
}

function scrubValue(value: unknown, depth: number): unknown {
  if (depth > 6) {
    return REDACTED;
  }
  if (typeof value === 'string') {
    return redactSecretsInString(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => scrubValue(entry, depth + 1));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED
        : scrubValue(entry, depth + 1);
    }
    return output;
  }
  return value;
}

/** Redact sensitive keys and secret-like strings from one monitoring event. */
export function scrubMonitoringEvent<T extends Record<string, unknown>>(
  event: T,
): T {
  return scrubValue(event, 0) as T;
}
