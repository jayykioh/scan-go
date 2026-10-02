/**
 * P0-L05 interface i18n Functions Emulator evidence (REQ-I18N-001).
 *
 * These tests prove the authenticated locale persistence boundary: the server
 * validates a typed locale before it writes `users/{uid}.locale`, returns a
 * persisted locale on read, and rejects a bad or unauthenticated request.
 *
 * Run with the root script:
 *   npm run test:emulator
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  deleteApp as deleteAdminApp,
  getApps as getAdminApps,
  initializeApp as initializeAdminApp,
  type App as AdminApp,
} from 'firebase-admin/app';
import {
  getAuth as getAdminAuth,
  type Auth as AdminAuth,
} from 'firebase-admin/auth';
import {
  getFirestore as getAdminFirestore,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  deleteApp as deleteClientApp,
  getApps as getClientApps,
  initializeApp as initializeClientApp,
  type FirebaseApp,
} from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from 'firebase/functions';
import type { LocaleResult } from '../../../shared/contracts/i18n.contract.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const REGION = 'us-central1';
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

let adminApp: AdminApp;
let db: Firestore;
let adminAuth: AdminAuth;

let clientApp: FirebaseApp;
let auth: Auth;
let functions: Functions;

beforeAll(() => {
  adminApp =
    getAdminApps().length > 0
      ? getAdminApps()[0]
      : initializeAdminApp({ projectId: PROJECT_ID });
  db = getAdminFirestore(adminApp);
  adminAuth = getAdminAuth(adminApp);

  clientApp =
    getClientApps().length > 0
      ? getClientApps()[0]
      : initializeClientApp({
          projectId: PROJECT_ID,
          apiKey: 'demo-api-key',
          appId: '1:demo:web:demo',
        });
  auth = getAuth(clientApp);
  connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  functions = getFunctions(clientApp, REGION);
  connectFunctionsEmulator(functions, FUNCTIONS_HOST, FUNCTIONS_PORT);
});

afterAll(async () => {
  await deleteClientApp(clientApp).catch(() => undefined);
  await deleteAdminApp(adminApp).catch(() => undefined);
});

beforeEach(async () => {
  await db.recursiveDelete(db.collection('users'));
  const existing = await adminAuth.listUsers();
  if (existing.users.length > 0) {
    await adminAuth.deleteUsers(existing.users.map((user) => user.uid));
  }
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

function getLocaleCallable() {
  return httpsCallable<void, LocaleResult>(functions, 'callableI18nGetLocale');
}

function setLocaleCallable() {
  return httpsCallable<{ locale: string }, LocaleResult>(
    functions,
    'callableI18nSetLocale',
  );
}

async function signUp(email: string): Promise<string> {
  const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  return credential.user.uid;
}

async function expectRejection(
  promise: Promise<unknown>,
  codeFragment: string,
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  if (caught === undefined) {
    throw new Error(`Expected the callable to reject with "${codeFragment}".`);
  }
  const code = (caught as { code?: string }).code ?? '';
  expect(code).toContain(codeFragment);
}

describe('authenticated locale persistence (REQ-I18N-001)', () => {
  it('persists a supported locale and reads it back', async () => {
    const uid = await signUp('locale-en@example.com');

    const saved = await setLocaleCallable()({ locale: 'en' });
    expect(saved.data).toMatchObject({ locale: 'en', isPersisted: true });

    const stored = await db.doc(`users/${uid}`).get();
    expect(stored.get('locale')).toBe('en');

    const read = await getLocaleCallable()({});
    expect(read.data).toMatchObject({ locale: 'en', isPersisted: true });
  });

  it('defaults to vi for a user with no persisted locale', async () => {
    await signUp('locale-fresh@example.com');
    const read = await getLocaleCallable()({});
    expect(read.data).toMatchObject({ locale: 'vi', isPersisted: false });
  });

  it('rejects an unsupported locale without writing', async () => {
    const uid = await signUp('locale-bad@example.com');
    await expectRejection(
      setLocaleCallable()({ locale: 'fr' }),
      'invalid-argument',
    );
    const stored = await db.doc(`users/${uid}`).get();
    expect(stored.exists).toBe(false);
  });

  it('denies an unauthenticated caller', async () => {
    await expectRejection(getLocaleCallable()({}), 'unauthenticated');
    await expectRejection(
      setLocaleCallable()({ locale: 'en' }),
      'unauthenticated',
    );
  });
});
