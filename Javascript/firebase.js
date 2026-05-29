import { initializeApp } from "./firebase-sdk/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  verifyPasswordResetCode,
  confirmPasswordReset,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updateProfile
} from "./firebase-sdk/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  getDocs,
  getCountFromServer,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment
} from "./firebase-sdk/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "./firebase-sdk/firebase-storage.js";
import {
  getFunctions,
  httpsCallable
} from "./firebase-sdk/firebase-functions.js";

const app = initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
});
export const storage = getStorage(app);
export const cloudFunctions = getFunctions(app);

export const googleProvider = new GoogleAuthProvider();

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  verifyPasswordResetCode,
  confirmPasswordReset,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updateProfile,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  getDocs,
  getCountFromServer,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  getFunctions,
  httpsCallable
};
