import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, update, type Database } from 'firebase/database';
import type { FirebaseConfigState } from './types';

const STORAGE_KEY = 'ss_stock_admin_firebase_config';

export const defaultFirebaseConfig: FirebaseConfigState = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCy8ZD_bsb4pVkoGN0YskBrjh7aSWT_Oyw',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'ss-stock-9be05.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://ss-stock-9be05-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ss-stock-9be05',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'ss-stock-9be05.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '411323985010',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:411323985010:android:8105b5e25ac093e07da6eb',
};

export function loadSavedFirebaseConfig(): FirebaseConfigState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...defaultFirebaseConfig, ...JSON.parse(raw) };
    }
  } catch {}
  return defaultFirebaseConfig;
}

export function saveFirebaseConfig(config: FirebaseConfigState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

let appInstance: FirebaseApp | null = null;
let dbInstance: Database | null = null;

export function initFirebase(config: FirebaseConfigState): { app: FirebaseApp | null; db: Database | null } {
  if (!config.apiKey || !config.databaseURL) {
    return { app: null, db: null };
  }

  try {
    if (getApps().length > 0) {
      appInstance = getApps()[0];
    } else {
      appInstance = initializeApp(config);
    }
    dbInstance = getDatabase(appInstance);
    return { app: appInstance, db: dbInstance };
  } catch (e) {
    console.error('[AdminFirebase] Initialization error:', e);
    return { app: null, db: null };
  }
}

export { ref, onValue, set, update };
