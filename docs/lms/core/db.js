// lms/core/db.js
// Firestore data access layer — Phase 3 (profile/progress) + Phase 6 (access control)
//                              + Personalized Lessons field (new)
//
// SDK version pin: 10.12.0 — keep in sync with auth.js. Import specifiers must
// be static string literals (see note in auth.js).
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  addDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { getStorage, ref, uploadBytes, getDownloadURL }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { FIREBASE_CONFIG } from './firebase-config.js';
import { LANG_KEY } from './registry.js';

// ── Initialise Firebase app ────────────────────────────────────────────────
// db.js is imported by auth.js, so it may be evaluated BEFORE auth.js calls
// initializeApp(). Calling it here too is safe — same config returns the same
// underlying app instance (Firebase de-duplicates by project ID).
const app = initializeApp(FIREBASE_CONFIG);
export const db      = getFirestore(app);
const        storage = getStorage(app);

// Firestore document structure:
// users/{uid}/
//   profile: { displayName, email, tier, lang, createdAt, lastSeen }
//   progress/{storageKey}: { <checkboxKey>: true/false, ... }
//   access/modules: { <moduleId>: true/false, ... }
//   personalized_lessons/{lessonId}: { title, topic, html, createdAt, requestId, progress }
// userIndex/{uid}: { displayName, email, photoURL }
// tiers/{tierId}: { <moduleId>: true/false, ... }   — Phase 7 (category defaults)
// personalizedLessonRequests/{requestId}: { uid, topic, answers, profileFileURL,
//   profileFileName, targetJobFileURL, targetJobFileName, targetAbilitiesFileURL,
//   targetAbilitiesFileName, status, requestedAt, fulfilledAt, fulfilledBy,
//   lessonId, adminNote }
//   — `answers` may also carry plain-text `targetJob` / `targetAbilities`
//     entries when the user chose "Write" instead of "Upload" for those
//     fields (see renderPersonalizedForm/handlePersonalizedSubmit in app.js).
// courses/{courseId}: { title, subtitle, icon, fieldId, order, status,
//   requiresAuth, requiresPro, createdBy, createdAt, updatedAt }
//   — `status` is 'draft' | 'published'. `fieldId` optionally slots the
//     course under one of LMS_CONFIG.fields, same as static modules.
// courses/{courseId}/lessons/{lessonId}: { title, subtitle, order, html,
//   htmlStorageURL, requiresAuth, requiresPro, progress, createdAt, updatedAt }
//   — content is EITHER inline `html` OR `htmlStorageURL` (Storage), exactly
//     like personalized_lessons. `progress` defaults to
//     { type: 'untracked', total: 0 } unless the admin authors a checklist.

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
// (Uses the static getDocs import — the old dynamic import in this function
//  has been replaced now that getDocs is a top-level static import.)
export async function getAllUsers() {
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

// ── ACCESS CONTROL (Phase 7 — tier/category defaults) ──────────────────────

/**
 * Returns the default module-access map for a tier (category), e.g.
 * { database: true, python: false }. Returns null when the tier has never
 * been saved from the admin Categories tab — callers should fall back to
 * the platform's accessControl.mode default in that case, exactly like an
 * unconfigured per-user access doc.
 *
 * @param {string} tierId — 'anonymous' | 'free' | 'pro' | 'admin' | ...
 * @returns {Promise<Object<string, boolean>|null>}
 */
export async function getTierAccess(tierId) {
  const snap = await getDoc(doc(db, 'tiers', tierId));
  return snap.exists() ? snap.data() : null;
}

// ── PERSONALIZED LESSONS — USER SIDE ──────────────────────────────────────

/**
 * Uploads a file to Firebase Storage under `profile-uploads/{uid}/{requestId}/…`.
 * File type and size must be validated client-side BEFORE calling this.
 *
 * `kind` distinguishes which form field the file came from so multiple
 * uploads on the same request (CV, target-job posting, target-abilities
 * brief) never collide even if the filenames match. The default ('profile')
 * keeps the exact original path — `profile-uploads/{uid}/{requestId}/{filename}`
 * — so existing callers and Security Rules are unaffected; any other kind is
 * namespaced with a `{kind}-` prefix instead of a new path segment, so a
 * single Security Rules glob on the request folder still covers every file.
 *
 * @param {string} uid
 * @param {string} requestId — used as a sub-folder to avoid collisions
 * @param {File}   file
 * @param {'profile'|'targetJob'|'targetAbilities'} [kind]
 * @returns {Promise<{ url: string, name: string }>}
 */
export async function uploadProfileFile(uid, requestId, file, kind = 'profile') {
  const filePath = kind === 'profile'
    ? `profile-uploads/${uid}/${requestId}/${file.name}`
    : `profile-uploads/${uid}/${requestId}/${kind}-${file.name}`;
  const fileRef  = ref(storage, filePath);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return { url, name: file.name };
}

/**
 * Creates a new personalized lesson request document.
 * Returns the Firestore-generated requestId, which is also used as the
 * Storage sub-folder key for the optional profile file upload.
 *
 * @param {string} uid
 * @param {{ topic: string, answers: object,
 *           profileFileURL?: string|null, profileFileName?: string|null }} data
 * @returns {Promise<string>} requestId
 */
export async function createPersonalizedRequest(uid, data) {
  const docRef = await addDoc(collection(db, 'personalizedLessonRequests'), {
    uid,
    topic:                   data.topic,
    answers:                 data.answers  ?? {},
    profileFileURL:          data.profileFileURL  ?? null,
    profileFileName:         data.profileFileName ?? null,
    // Target-job / target-abilities files (uploaded via uploadProfileFile +
    // updatePersonalizedRequestFile with kind='targetJob'/'targetAbilities'
    // right after this doc is created). Declared explicitly so a future
    // Firestore query that filters on these fields never hits a
    // missing-field error for requests created before the file is attached.
    targetJobFileURL:        null,
    targetJobFileName:       null,
    targetAbilitiesFileURL:  null,
    targetAbilitiesFileName: null,
    status:                  'pending',
    requestedAt:             serverTimestamp(),
    fulfilledAt:             null,
    fulfilledBy:             null,
    lessonId:                null,
    adminNote:               null
  });
  return docRef.id;
}

/**
 * Updates an existing request doc with a file URL after a successful Storage
 * upload. Called immediately after uploadProfileFile() in the submit flow,
 * once per attached file. `kind` must match the kind passed to
 * uploadProfileFile() — it selects which pair of Firestore fields gets
 * written (`profileFileURL`/`profileFileName` by default, or
 * `targetJobFileURL`/`targetJobFileName`, etc.)
 *
 * @param {string} requestId
 * @param {string} fileURL
 * @param {string} fileName
 * @param {'profile'|'targetJob'|'targetAbilities'} [kind]
 */
export async function updatePersonalizedRequestFile(requestId, fileURL, fileName, kind = 'profile') {
  const urlField  = kind === 'profile' ? 'profileFileURL'  : `${kind}FileURL`;
  const nameField = kind === 'profile' ? 'profileFileName' : `${kind}FileName`;
  await updateDoc(doc(db, 'personalizedLessonRequests', requestId), {
    [urlField]:  fileURL,
    [nameField]: fileName
  });
}

/**
 * Returns all requests submitted by a given user, most recent first.
 * @param {string} uid
 * @returns {Promise<Array<object>>}
 */
export async function getMyPersonalizedRequests(uid) {
  const q    = query(
    collection(db, 'personalizedLessonRequests'),
    where('uid', '==', uid),
    orderBy('requestedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Returns all fulfilled personalized lessons for a given user, most recent first.
 * @param {string} uid
 * @returns {Promise<Array<object>>}
 */
export async function getPersonalizedLessons(uid) {
  const q    = query(
    collection(db, 'users', uid, 'personalized_lessons'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── PERSONALIZED LESSONS — ADMIN SIDE ─────────────────────────────────────

/**
 * Admin: returns ALL requests across all users, most recent first.
 * @returns {Promise<Array<object>>}
 */
export async function getAllPersonalizedRequests() {
  const q    = query(
    collection(db, 'personalizedLessonRequests'),
    orderBy('requestedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Admin: publishes a lesson for a user and marks the request as fulfilled.
 * Writes the lesson doc FIRST, then stamps the request — there is no moment
 * where the request reads 'fulfilled' but the lesson document doesn't exist.
 *
 * The lesson's progress uses `{ type: 'untracked', total: 0 }` so it flows
 * through the existing checklist/sync code path without special-casing.
 * Swap to `{ type: 'checklist', storageKey: '...', total: N }` if the admin
 * authors a lesson that has checkboxes.
 *
 * @param {string} requestId
 * @param {string} uid        — the requesting user's uid
 * @param {string} adminUid   — the admin's uid (stored in fulfilledBy)
 * @param {{ title: string, topic: string, html: string }} lessonData
 * @returns {Promise<string>} the new lessonId
 */
export async function publishPersonalizedLesson(requestId, uid, adminUid, lessonData) {
  // Auto-generate the lesson doc ID
  const lessonRef = doc(collection(db, 'users', uid, 'personalized_lessons'));
  const lessonId  = lessonRef.id;

  await setDoc(lessonRef, {
    title:     lessonData.title,
    topic:     lessonData.topic,
    html:      lessonData.html,
    createdAt: serverTimestamp(),
    requestId,
    progress:  { type: 'untracked', total: 0 }
  });

  await updateDoc(doc(db, 'personalizedLessonRequests', requestId), {
    status:      'fulfilled',
    fulfilledAt: serverTimestamp(),
    fulfilledBy: adminUid,
    lessonId
  });

  return lessonId;
}

/**
 * Admin: declines a request, optionally with a message shown back to the user.
 *
 * @param {string}      requestId
 * @param {string}      adminUid
 * @param {string|null} adminNote
 */
export async function declinePersonalizedRequest(requestId, adminUid, adminNote = null) {
  await updateDoc(doc(db, 'personalizedLessonRequests', requestId), {
    status:      'declined',
    fulfilledBy: adminUid,
    fulfilledAt: serverTimestamp(),
    adminNote:   adminNote || null
  });
}

/**
 * Admin: marks a request as 'in_review' (optional workflow step — signals to
 * the user that someone has picked it up before authoring is complete).
 *
 * @param {string} requestId
 */
export async function setRequestInReview(requestId) {
  await updateDoc(doc(db, 'personalizedLessonRequests', requestId), {
    status: 'in_review'
  });
}

// ── COURSES (admin-authored, multi-lesson) ──────────────────────────────────
//
// These let an admin build a full course — title + ordered list of lessons —
// that's visible to ALL eligible learners (gated by requiresAuth/requiresPro
// and, if assigned a fieldId, the same module-access toggles used for static
// LMS_CONFIG modules). This is distinct from personalized_lessons above,
// which are one-off and per-user.
//
// Query design note: getPublishedCourses() combines a `where('status', ...)`
// equality filter with `orderBy('order')` on a different field — the exact
// combination that required a composite index for personalizedLessonRequests
// earlier. It's required here too, for the same reason, AND because the
// Security Rules check `resource.data.status` per-document (see
// firestore.rules), so client-side filtering after an unfiltered fetch is
// not just slower but will be REJECTED for non-admins. Create the index
// proactively: collection `courses`, fields `status` Ascending +
// `order` Ascending (Query scope: Collection) — or just trigger the
// auto-generated link by calling this once and reading the console error.

/**
 * Learner-facing: published courses only, in display order.
 * @returns {Promise<Array<object>>}
 */
export async function getPublishedCourses() {
  const q = query(
    collection(db, 'courses'),
    where('status', '==', 'published'),
    orderBy('order', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Admin-facing: every course regardless of status (Course Manager tab).
 * No `where` filter is needed here — Security Rules already restrict this
 * query to admins (`allow read: if ... || isAdmin()`), and a single-field
 * orderBy() never needs a composite index.
 * @returns {Promise<Array<object>>}
 */
export async function getAllCoursesForAdmin() {
  const q = query(collection(db, 'courses'), orderBy('order', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Admin: creates a new course in 'draft' status. Callers should pass `order`
 * as (current course count) so it lands at the end of the list — the admin
 * UI already holds the full list in memory after getAllCoursesForAdmin().
 *
 * @param {string} adminUid
 * @param {{ title: string, subtitle?: string, icon?: string,
 *           fieldId?: string|null, order?: number,
 *           requiresAuth?: boolean, requiresPro?: boolean }} data
 * @returns {Promise<string>} courseId
 */
export async function createCourse(adminUid, data) {
  const docRef = await addDoc(collection(db, 'courses'), {
    title:        data.title,
    subtitle:     data.subtitle ?? '',
    icon:         data.icon ?? '📘',
    fieldId:      data.fieldId ?? null,
    order:        data.order ?? 0,
    status:       'draft',
    requiresAuth: data.requiresAuth ?? false,
    requiresPro:  data.requiresPro  ?? false,
    createdBy:    adminUid,
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp()
  });
  return docRef.id;
}

/**
 * Admin: partial update of a course's metadata. Does NOT touch `status` —
 * use setCourseStatus() for publish/unpublish so that transition stays
 * explicit and auditable at call sites.
 *
 * @param {string} courseId
 * @param {object} data — any subset of title/subtitle/icon/fieldId/order/
 *                         requiresAuth/requiresPro
 */
export async function updateCourse(courseId, data) {
  await updateDoc(doc(db, 'courses', courseId), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

/**
 * Admin: publish or unpublish a course. Lessons inherit this automatically —
 * Security Rules gate lesson reads on the parent course's status, so there's
 * nothing extra to flip on the lessons themselves.
 *
 * @param {string} courseId
 * @param {'draft'|'published'} status
 */
export async function setCourseStatus(courseId, status) {
  if (status !== 'draft' && status !== 'published') {
    throw new Error(`Invalid course status: ${status}`);
  }
  await updateDoc(doc(db, 'courses', courseId), {
    status,
    updatedAt: serverTimestamp()
  });
}

/**
 * Admin: soft-deletes a course by setting its status to 'archived'.
 *
 * Archived courses are excluded from getPublishedCourses() (the learner-facing
 * query uses `where('status', '==', 'published')`) and from the admin access
 * chip registries, so they disappear from both UIs immediately. However the
 * Firestore doc and all its lesson sub-documents remain intact, which means:
 *   • Per-user / tier access map entries for this courseId survive — they
 *     silently become inert and automatically re-activate if the course is
 *     restored, with no admin intervention needed.
 *   • Learner progress records stored under users/{uid}/progress/{storageKey}
 *     for checklist-type lessons are unaffected.
 *
 * Use permanentlyDeleteCourse() only when you are sure the course and all its
 * lesson content are no longer needed by anyone.
 *
 * @param {string} courseId
 */
export async function archiveCourse(courseId) {
  await updateDoc(doc(db, 'courses', courseId), {
    status:    'archived',
    updatedAt: serverTimestamp()
  });
}

/**
 * Admin: restores an archived course to 'draft' status so it can be edited
 * and eventually republished. The inverse of archiveCourse().
 *
 * @param {string} courseId
 */
export async function restoreCourse(courseId) {
  await updateDoc(doc(db, 'courses', courseId), {
    status:    'draft',
    updatedAt: serverTimestamp()
  });
}

/**
 * Admin: permanently deletes a course AND all of its lessons. This is
 * irreversible. Prefer archiveCourse() for courses that may be restored or
 * that have learners with recorded progress.
 *
 * The client SDK can't cascade-delete a subcollection automatically, so
 * lessons are fetched and deleted individually before the course doc itself.
 *
 * @param {string} courseId
 */
export async function permanentlyDeleteCourse(courseId) {
  const lessonsSnap = await getDocs(collection(db, 'courses', courseId, 'lessons'));
  await Promise.all(lessonsSnap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'courses', courseId));
}

/**
 * Admin: clones an existing course (any status) into a new draft course.
 * The clone gets a "[Copy] " title prefix, is set to 'draft' status regardless
 * of the original, and all lesson sub-documents are copied verbatim. The
 * `order` field is set to `newOrder` (pass allCourses.length from the admin
 * UI so the clone lands at the end of the list).
 *
 * createdAt / updatedAt are reset to server time so the clone sorts correctly
 * in recently-updated views. createdBy is set to the acting admin's uid.
 *
 * @param {string} courseId   — source course to clone
 * @param {string} adminUid   — uid of the admin performing the clone
 * @param {number} newOrder   — display-order position for the clone
 * @returns {Promise<string>} the new courseId
 */
export async function cloneCourse(courseId, adminUid, newOrder = 0) {
  // 1. Read the original course doc
  const originalSnap = await getDoc(doc(db, 'courses', courseId));
  if (!originalSnap.exists()) throw new Error(`Course "${courseId}" not found`);
  const original = originalSnap.data();

  // 2. Read all lessons ordered by their current display position
  const lessonsSnap = await getDocs(
    query(collection(db, 'courses', courseId, 'lessons'), orderBy('order', 'asc'))
  );
  const lessons = lessonsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 3. Write the new course doc (always draft — never accidentally publish the clone)
  const { createdAt: _ca, updatedAt: _ua, ...courseData } = original;
  const newCourseRef = await addDoc(collection(db, 'courses'), {
    ...courseData,
    title:     `[Copy] ${original.title}`,
    status:    'draft',
    order:     newOrder,
    createdBy: adminUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // 4. Copy each lesson into the new course's subcollection (preserving order)
  await Promise.all(lessons.map(lesson => {
    const { id: _id, createdAt: _lca, updatedAt: _lua, ...lessonData } = lesson;
    return addDoc(collection(db, 'courses', newCourseRef.id, 'lessons'), {
      ...lessonData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }));

  return newCourseRef.id;
}

/**
 * Admin: persists a new display order for courses after a drag-reorder in
 * the admin UI. `orderedIds` is the full list of course IDs in their new
 * order; each gets `order` set to its array index.
 *
 * @param {string[]} orderedIds
 */
export async function reorderCourses(orderedIds) {
  await Promise.all(
    orderedIds.map((id, i) => updateDoc(doc(db, 'courses', id), { order: i }))
  );
}

// ── COURSE LESSONS ───────────────────────────────────────────────────────────

/**
 * Returns every lesson in a course, in display order. Used by both the
 * admin Course Editor and the learner-facing renderer — visibility for the
 * latter is already enforced by Security Rules via the parent course's
 * status, so no separate "published" concept exists at the lesson level.
 *
 * @param {string} courseId
 * @returns {Promise<Array<object>>}
 */
export async function getCourseLessons(courseId) {
  const q = query(
    collection(db, 'courses', courseId, 'lessons'),
    orderBy('order', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Admin: adds a lesson to a course. Content is EITHER inline `html` (small/
 * typical case, mirrors personalized_lessons) OR `htmlStorageURL` for
 * content too large for a Firestore doc — never both. Caller passes `order`
 * as (current lesson count in that course).
 *
 * @param {string} courseId
 * @param {{ title: string, subtitle?: string, order?: number,
 *           html?: string|null, htmlStorageURL?: string|null,
 *           requiresAuth?: boolean, requiresPro?: boolean,
 *           progress?: object }} data
 * @returns {Promise<string>} lessonId
 */
export async function createCourseLesson(courseId, data) {
  const docRef = await addDoc(collection(db, 'courses', courseId, 'lessons'), {
    title:          data.title,
    subtitle:       data.subtitle ?? '',
    order:          data.order ?? 0,
    html:           data.html ?? null,
    htmlStorageURL: data.htmlStorageURL ?? null,
    requiresAuth:   data.requiresAuth ?? false,
    requiresPro:    data.requiresPro  ?? false,
    progress:       data.progress ?? { type: 'untracked', total: 0 },
    createdAt:      serverTimestamp(),
    updatedAt:      serverTimestamp()
  });
  return docRef.id;
}

/**
 * Admin: partial update of a lesson (title, content, access flags, etc).
 *
 * @param {string} courseId
 * @param {string} lessonId
 * @param {object} data
 */
export async function updateCourseLesson(courseId, lessonId, data) {
  await updateDoc(doc(db, 'courses', courseId, 'lessons', lessonId), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

/**
 * Admin: hard-deletes a single lesson from a course.
 *
 * ⚠ This is permanent. If learners have checklist progress stored under
 * users/{uid}/progress/{lesson.progress.storageKey} for this lesson, that
 * progress document becomes orphaned (it won't be deleted automatically).
 * Prefer editing the lesson HTML in-place over deletion while a course is
 * published and in use. If deletion is necessary, unpublish the course first.
 *
 * @param {string} courseId
 * @param {string} lessonId
 */
export async function deleteCourseLesson(courseId, lessonId) {
  await deleteDoc(doc(db, 'courses', courseId, 'lessons', lessonId));
}

/**
 * Admin: persists a new lesson order within a course after a drag-reorder.
 *
 * @param {string} courseId
 * @param {string[]} orderedIds
 */
export async function reorderCourseLessons(courseId, orderedIds) {
  await Promise.all(
    orderedIds.map((id, i) =>
      updateDoc(doc(db, 'courses', courseId, 'lessons', id), { order: i })
    )
  );
}