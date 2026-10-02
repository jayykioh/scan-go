import { HttpsError } from 'firebase-functions/v2/https';

export interface AppCheckRequestLike {
  app?: unknown;
}

/**
 * App Check is enforced by default. It is skipped only for local emulator
 * runs or when deployment explicitly disables enforcement.
 */
export function isAppCheckEnforced(): boolean {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return false;
  }
  if (process.env.ENFORCE_APP_CHECK === 'false') {
    return false;
  }
  return true;
}

/**
 * Reject a callable request without a valid App Check token when enforcement
 * is active. `request.app` is present only when the token is valid.
 */
export function assertAppCheck(request: AppCheckRequestLike): void {
  if (!isAppCheckEnforced()) {
    return;
  }
  if (!request.app) {
    throw new HttpsError(
      'failed-precondition',
      'Yêu cầu thiếu App Check hợp lệ.',
    );
  }
}
