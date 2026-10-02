/**
 * Grant or revoke the server-verified ADMIN platform claim (REQ-ADM-001).
 *
 * ADMIN is not a self-service account. It is a Firebase Auth user with the
 * `admin: true` custom claim that `firestore.rules` and the Cloud Functions
 * verify. This script sets that claim.
 *
 * Real project (Application Default Credentials):
 *   npm run admin:grant -- --email owner@shop.vn
 *   npm run admin:grant -- --uid <uid> --project scango-8f0e9 --revoke
 *
 * Auth emulator:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run admin:grant -- --email owner@shop.vn
 *
 * After a change, sign out and sign in again so the ID token carries the claim.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { mergeAdminClaim, parseAdminGrantArgs } from './admin-claim.js';

async function main(): Promise<void> {
  const options = parseAdminGrantArgs(process.argv.slice(2));
  const useEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);

  if (!useEmulator) {
    // End-user Application Default Credentials have no quota project by default.
    // Without one, the Identity Toolkit API answers 403. Default it to the
    // target project so `npm run admin:grant` works with plain `gcloud` ADC.
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= options.projectId;
  }

  initializeApp(
    useEmulator
      ? { projectId: options.projectId }
      : { credential: applicationDefault(), projectId: options.projectId },
  );

  const auth = getAuth();
  const user =
    options.uid !== undefined
      ? await auth.getUser(options.uid)
      : await auth.getUserByEmail(options.email as string);

  const claims = mergeAdminClaim(user.customClaims, !options.revoke);
  await auth.setCustomUserClaims(user.uid, claims);

  const action = options.revoke ? 'Đã thu hồi' : 'Đã cấp';
  process.stdout.write(
    `${action} quyền ADMIN cho ${user.email ?? user.uid} (${user.uid}). ` +
      'Đăng xuất rồi đăng nhập lại để token cập nhật.\n',
  );
}

const invokedDirectly =
  process.argv[1]?.endsWith('grant-admin.ts') ||
  process.argv[1]?.endsWith('grant-admin.js') ||
  false;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
