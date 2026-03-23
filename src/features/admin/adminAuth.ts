import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth } from "../../lib/firebase";
import { db } from "../../lib/firebase";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
  hd: "capma.org",
});

export function isCapmaAdminUser(user: User | null) {
  const email = user?.email?.trim().toLowerCase();
  return Boolean(email && email.endsWith("@capma.org"));
}

async function hasAdminRecord(user: User) {
  const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
  return adminSnapshot.exists();
}

export async function signInAdminWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);

  if (!isCapmaAdminUser(result.user)) {
    await signOut(auth);
    throw new Error("Use a @capma.org Google account to access CAPMA admin.");
  }

  const adminAllowed = await hasAdminRecord(result.user);

  if (!adminAllowed) {
    await signOut(auth);
    throw new Error("Your CAPMA account is not authorized for admin access.");
  }

  return result.user;
}

export function useAdminAuth() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);

       if (!nextUser || !isCapmaAdminUser(nextUser)) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const adminAllowed = await hasAdminRecord(nextUser);
        setIsAdmin(adminAllowed);
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  return {
    user,
    loading,
    isAdmin,
  };
}
