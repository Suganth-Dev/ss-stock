export interface ActivationCode {
  id?: string;
  code?: string; // Visible immediately after generation
  codeHash: string; // SHA-256 hash stored in DB
  targetDeviceId?: string; // If set, only this specific device can redeem it
  deviceModel?: string;
  status: 'UNUSED' | 'USED';
  createdAt: number;
  usedAt?: number | null;
  usedByUid?: string | null;
  usedByEmail?: string | null;
  usedDeviceId?: string | null;
}

export interface UserAccount {
  uid: string;
  email: string;
  status: 'ACTIVE' | 'PENDING' | 'BLOCKED';
  licenseId?: string;
  deviceId?: string;
  activatedAt?: number;
  lastLoginAt?: number;
}

export interface DeviceBinding {
  deviceId: string;
  uid?: string;
  model?: string;
  status: 'ACTIVE' | 'PENDING' | 'DEACTIVATED';
  requestedAt?: number;
  activatedAt?: number;
  lastSeenAt?: number;
}

export interface FirebaseConfigState {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}
