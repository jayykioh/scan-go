import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export function ensureAdminInitialized(): void {
  if (getApps().length === 0) {
    initializeApp();
  }
}

// Run during module evaluation so Admin is initialized before any callable runs.
ensureAdminInitialized();

export function getDb(): Firestore {
  ensureAdminInitialized();
  return getFirestore();
}
