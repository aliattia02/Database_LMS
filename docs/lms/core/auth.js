// lms/core/auth.js
// Firebase Authentication wrapper — Phase 3
//
// Exports:
//   auth              — the Firebase Auth instance (needed by db.js / admin.js)
//   signInWithGoogle  — opens Google sign-in popup, ensures user doc exists
//   signUpWithEmail   — creates email/password account, ensures user doc exists
//   signInWithEmail   — authenticates an existing email/password account
//   signOutUser       — signs the current user out
//   onAuthChange      — registers a callback fired on every auth-state change
//
// SDK version pin: update the version string below when upgrading Firebase.
// Check the latest at: https://www.gstatic.com/firebasejs/

const FIREBASE_SDK_VERSION = '10.12.0';
const SDK_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from `${SDK_BASE}/firebase-auth.js`;

import { initializeApp } from `${SDK_BASE}/firebase-app.js`;

import { FIREBASE_CONFIG } from './firebase-config.js';
import { ensureUserDocument } from './db.js';

// ── Initialise Firebase app ────────────────────────────────────────────────
// initializeApp is safe to call multiple times with the same config in the
// same JS module graph; Firebase de-duplicates by project ID.
const app = initializeApp(FIREBASE_CONFIG);

/** Shared Auth instance — imported by db.js and anywhere else that needs it. */
export const auth = getAuth(app);

// ── Sign-in helpers ────────────────────────────────────────────────────────

/**
 * Opens a Google sign-in popup.
 * On success, creates or updates the user's Firestore document.
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  await ensureUserDocument(result.user);
  return result.user;
}

/**
 * Creates a new email/password account and signs the user in.
 * On success, creates the user's Firestore document.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function signUpWithEmail(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await ensureUserDocument(result.user);
  return result.user;
}

/**
 * Authenticates an existing email/password account.
 * Does NOT call ensureUserDocument — the document was created at sign-up.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function signInWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

// ── Sign-out ───────────────────────────────────────────────────────────────

/**
 * Signs the current user out.
 * The onAuthStateChanged listener in app.js picks this up and switches the UI
 * back to anonymous mode.
 * @returns {Promise<void>}
 */
export function signOutUser() {
  return signOut(auth);
}

// ── Auth state observer ────────────────────────────────────────────────────

/**
 * Registers a callback that fires immediately with the current user (or null)
 * and again on every subsequent sign-in / sign-out event.
 *
 * Usage in app.js:
 *   onAuthChange(async (user) => {
 *     currentUser = user;
 *     if (user) { ... } else { ... }
 *     render();
 *   });
 *
 * @param {(user: import('firebase/auth').User | null) => void} callback
 * @returns {() => void}  Unsubscribe function — call it to stop listening.
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
