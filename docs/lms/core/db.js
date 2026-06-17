// lms/core/db.js
// Firestore data access layer — Phase 3 (profile/progress) + Phase 6 (access control)
//
// SDK version pin: 10.12.0 — keep in sync with auth.js. Import specifiers must
// be static string literals (see note in auth.js).
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { FIREBASE_CONFIG } from './firebase-config.js';
import { LANG_KEY } from './registry.js';

// ── Initialise Firebase app ────────────────────────────────────────────────
// db.js is imported by auth.js, so it may be evaluated BEFORE auth.js calls
// initializeApp(). Calling it here too is safe — same config returns the same
// underlying app instance (Firebase de-duplicates by project ID).
const app = initializeApp(FIREBASE_CONFIG);
export const db = getFirestore(app);

// Firestore document structure:
// users/{uid}/
//   profile: { displayName, email, tier, lang, createdAt, lastSeen }
//   progress/{storageKey}: { <checkboxKey>: true/false, ... }
//   access/modules: { <moduleId>: true/false, ... }
// userIndex/{uid}: { displayName, email, photoURL }

// ── PROFILE ─────────────────────────────────────────────────────────────────

export async function ensureUserDocument(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: user.displayName || '',
      email: user.email || '',
      tier: 'free',         // 'free' | 'pro'
      lang: localStorage.getItem(LANG_KEY) || 'en',
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp()
    });
  } else {
    await updateDoc(ref, { lastSeen: serverTimestamp() });
  }
  // upsertUserIndex is intentionally NOT called here. app.js's onAuthChange
  // calls it after every sign-in (all auth methods), making this the single
  // call site. Calling it here too would cause a redundant double-write on
  // Google sign-in and email sign-up.
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function updateUserLang(uid, lang) {
  await updateDoc(doc(db, 'users', uid), { lang });
}

// ── PROGRESS ────────────────────────────────────────────────────────────────

export async function getLessonProgress(uid, storageKey) {
  const snap = await getDoc(doc(db, 'users', uid, 'progress', storageKey));
  return snap.exists() ? snap.data() : {};
}

export async function setLessonProgress(uid, storageKey, data) {
  await setDoc(doc(db, 'users', uid, 'progress', storageKey), data, { merge: true });
}

/**
 * Clears progress for every known storageKey (Firestore has no client-side
 * collection delete, so each key is overwritten with an empty object).
 * @param {string} uid
 * @param {string[]} storageKeys - from registry, e.g. getAllStorageKeys()
 */
export async function clearAllProgress(uid, storageKeys = []) {
  for (const key of storageKeys) {
    await setDoc(doc(db, 'users', uid, 'progress', key), {});
  }
}

// ── ACCESS CONTROL (Phase 6) ────────────────────────────────────────────────

// Returns the moduleAccess map for a user, e.g. { database: true, python: false }
// Returns null when no access document exists (means "not configured").
export async function getModuleAccess(uid) {
  const snap = await getDoc(doc(db, 'users', uid, 'access', 'modules'));
  return snap.exists() ? snap.data() : null;
}

// Admin: write the full access map for a user (overwrites).
export async function setModuleAccess(uid, accessMap) {
  await setDoc(doc(db, 'users', uid, 'access', 'modules'), accessMap);
}

// Admin: toggle a single module on or off for a user.
export async function toggleModuleAccess(uid, moduleId, granted) {
  await setDoc(
    doc(db, 'users', uid, 'access', 'modules'),
    { [moduleId]: granted },
    { merge: true }
  );
}

// Admin: fetch all users from the public userIndex collection.
export async function getAllUsers() {
  const { collection, getDocs } = await import(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
  );
  const snap = await getDocs(collection(db, 'userIndex'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// Called on every sign-in: write basic info to userIndex so the admin
// panel can enumerate all registered accounts without querying auth.
export async function upsertUserIndex(user) {
  await setDoc(doc(db, 'userIndex', user.uid), {
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || ''
  }, { merge: true });
}