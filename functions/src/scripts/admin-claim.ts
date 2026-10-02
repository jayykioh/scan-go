/**
 * Pure helpers for the ADMIN claim CLI (REQ-ADM-001).
 *
 * ADMIN identity is the server-verified `admin: true` Auth custom claim. These
 * helpers parse the command line and merge the claim without importing
 * `firebase-admin`, so they stay unit-testable.
 */

export interface AdminClaimOptions {
  email?: string;
  uid?: string;
  revoke: boolean;
  projectId: string;
}

const DEFAULT_PROJECT_ID = 'scango-8f0e9';

export function parseAdminGrantArgs(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
): AdminClaimOptions {
  const options: AdminClaimOptions = {
    revoke: false,
    projectId: env.FIREBASE_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    if (flag === '--revoke') {
      options.revoke = true;
      continue;
    }

    if (flag === '--email' || flag === '--uid' || flag === '--project') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`Thiếu giá trị cho ${flag}.`);
      }
      index += 1;
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        throw new Error(`Thiếu giá trị cho ${flag}.`);
      }
      if (flag === '--email') {
        options.email = trimmed;
      } else if (flag === '--uid') {
        options.uid = trimmed;
      } else {
        options.projectId = trimmed;
      }
      continue;
    }

    throw new Error(`Tham số không hợp lệ: ${flag}.`);
  }

  if (options.email === undefined && options.uid === undefined) {
    throw new Error('Cần --email hoặc --uid để chọn người dùng.');
  }

  return options;
}

export function mergeAdminClaim(
  existing: Record<string, unknown> | undefined,
  grant: boolean,
): Record<string, unknown> {
  const claims: Record<string, unknown> = { ...(existing ?? {}) };
  if (grant) {
    claims.admin = true;
  } else {
    delete claims.admin;
  }
  return claims;
}
