import { initializeApp } from "firebase/app";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "firebase/auth";

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
  limit
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

export const auth = getAuth(app);
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account"
});

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function logout() {
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

export async function createCloudBackup(
  userId: string,
  data: unknown
) {
  const backupsRef = collection(db, "users", userId, "backups");

  await addDoc(backupsRef, {
    data,
    createdAt: serverTimestamp()
  });
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
    createdAt: item.data().createdAt
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

  // Preserve the current cloud data before restoring.
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
