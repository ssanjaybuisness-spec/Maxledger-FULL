
import { initializeApp } from "firebase/app";

import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut,
  onAuthStateChanged
} from "firebase/auth";

import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  deleteDoc
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBNPEjzQ9Q4D8Xx4c3hs1sCCgn9V7dySHk",
  authDomain: "maxledger-full.firebaseapp.com",
  projectId: "maxledger-full",
  storageBucket: "maxledger-full.firebasestorage.app",
  messagingSenderId: "848437171884",
  appId: "1:848437171884:web:e80289768d1c0f357d3109",
  measurementId: "G-4D925NZPM4"
};

const app = initializeApp(firebaseConfig);

export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, {
      persistence: indexedDBLocalPersistence
    })
  : getAuth(app);

export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account"
});

export async function signInWithGoogle() {
  if (Capacitor.isNativePlatform()) {
    const result = await FirebaseAuthentication.signInWithGoogle({
      skipNativeAuth: true
    });

    const idToken = result.credential?.idToken;

    if (!idToken) {
      throw new Error("Google sign-in did not return an ID token.");
    }

    const credential = GoogleAuthProvider.credential(idToken);

    return signInWithCredential(auth, credential);
  }

  return signInWithPopup(auth, googleProvider);
}

export async function logout() {
  if (Capacitor.isNativePlatform()) {
    await FirebaseAuthentication.signOut();
  }

  return signOut(auth);
}

export { onAuthStateChanged };

export async function getCloudData(userId: string) {
  const userRef = doc(db, "users", userId);
  const snapshot = await getDoc(userRef);

  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveCloudData(userId: string, data: unknown) {
  const userRef = doc(db, "users", userId);

  await setDoc(userRef, {
    data,
    updatedAt: serverTimestamp()
  });
}

async function trimCloudBackups(userId: string) {
  const backupsRef = collection(db, "users", userId, "backups");

  const backupsQuery = query(
    backupsRef,
    orderBy("createdAt", "desc"),
    limit(100)
  );

  const snapshot = await getDocs(backupsQuery);
  const oldBackups = snapshot.docs.slice(30);

  await Promise.all(
    oldBackups.map(item => deleteDoc(item.ref))
  );
}

export async function createCloudBackup(
  userId: string,
  data: unknown
) {
  const backupsRef = collection(db, "users", userId, "backups");

  await addDoc(backupsRef, {
    data,
    createdAt: serverTimestamp(),
    kind: "manual"
  });

  await trimCloudBackups(userId);
}

export async function createAutomaticCloudBackup(
  userId: string,
  data: unknown
) {
  const backupsRef = collection(db, "users", userId, "backups");

  const latestQuery = query(
    backupsRef,
    orderBy("createdAt", "desc"),
    limit(1)
  );

  const snapshot = await getDocs(latestQuery);

  if (!snapshot.empty) {
    const latest = snapshot.docs[0].data();
    const timestamp = latest.createdAt?.toDate?.();

    if (
      timestamp &&
      timestamp.toISOString().slice(0, 10) ===
      new Date().toISOString().slice(0, 10)
    ) {
      return false;
    }
  }

  await addDoc(backupsRef, {
    data,
    createdAt: serverTimestamp(),
    kind: "automatic"
  });

  await trimCloudBackups(userId);

  return true;
}

export async function getCloudBackups(userId: string) {
  const backupsRef = collection(db, "users", userId, "backups");

  const backupsQuery = query(
    backupsRef,
    orderBy("createdAt", "desc"),
    limit(30)
  );

  const snapshot = await getDocs(backupsQuery);

  return snapshot.docs.map(item => ({
    id: item.id,
    data: item.data().data,
    createdAt: item.data().createdAt,
    kind: item.data().kind ?? "manual"
  }));
}

export async function restoreCloudBackup(
  userId: string,
  backupId: string
) {
  const userRef = doc(db, "users", userId);
  const backupRef = doc(db, "users", userId, "backups", backupId);

  const backupSnapshot = await getDoc(backupRef);

  if (!backupSnapshot.exists()) {
    throw new Error("Backup not found.");
  }

  const backupData = backupSnapshot.data().data;

  if (!backupData) {
    throw new Error("Backup data is empty.");
  }

  const currentSnapshot = await getDoc(userRef);

  if (currentSnapshot.exists() && currentSnapshot.data().data) {
    await createCloudBackup(
      userId,
      currentSnapshot.data().data
    );
  }

  await setDoc(userRef, {
    data: backupData,
    updatedAt: serverTimestamp()
  });

  return backupData;
}
