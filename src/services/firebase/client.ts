import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from 'firebase/functions';

import { FUNCTIONS_REGION } from '@shared/config/region';

export { FUNCTIONS_REGION };

export const FUNCTIONS_EMULATOR_HOST = 'localhost';
export const FUNCTIONS_EMULATOR_PORT = 5001;

interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function usesFunctionsEmulator(): boolean {
  return import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === 'true';
}

export function getBackendMode(): 'local' | 'cloud' {
  return usesFunctionsEmulator() ? 'local' : 'cloud';
}

function readConfig(): FirebaseWebConfig | null {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  const isComplete = Object.values(config).every(
    (value) => typeof value === 'string' && value.length > 0,
  );

  return isComplete ? (config as FirebaseWebConfig) : null;
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedFirestore: Firestore | null = null;
let cachedFunctions: Functions | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (cachedApp) {
    return cachedApp;
  }

  const config = readConfig();
  if (!config) {
    return null;
  }

  cachedApp = getApps().length > 0 ? getApp() : initializeApp(config);
  return cachedApp;
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  if (!cachedAuth) {
    cachedAuth = getAuth(app);
  }

  return cachedAuth;
}

export function getFirebaseFirestore(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  if (!cachedFirestore) {
    cachedFirestore = getFirestore(app);
  }

  return cachedFirestore;
}

export function getFirebaseFunctions(): Functions | null {
  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  if (!cachedFunctions) {
    cachedFunctions = getFunctions(app, FUNCTIONS_REGION);
    if (usesFunctionsEmulator()) {
      connectFunctionsEmulator(
        cachedFunctions,
        FUNCTIONS_EMULATOR_HOST,
        FUNCTIONS_EMULATOR_PORT,
      );
    }
  }

  return cachedFunctions;
}
