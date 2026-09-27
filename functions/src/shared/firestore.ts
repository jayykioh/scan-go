import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export function getDb(): Firestore {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}
