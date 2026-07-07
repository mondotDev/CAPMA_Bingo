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
});

const ADMIN_EMAIL_DOMAINS = ["capma.org", "connerlyandassociates.com"];

export function isCapmaAdminUser(user: User | null) {
  const email = user?.email?.trim().toLowerCase();
  return Boolean(
    email && ADMIN_EMAIL_DOMAINS.some((domain) => email.endsWith(`@${domain}`)),
  );
}

async function hasAdminRecord(user: User) {
  const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
  return adminSnapshot.exists();
}

async function requireAdminAccess(user: User) {
  if (!isCapmaAdminUser(user)) {
    await signOut(auth);
    throw new Error(
      "Use a CAPMA or Connerly & Associates Google account to access CAPMA admin.",
    );
  }

  const adminAllowed = await hasAdminRecord(user);

  if (!adminAllowed) {
    const email = user.email?.trim() || "this Google account";

    throw new Error(
      `Signed in as ${email}, but no admin allowlist record exists yet. ` +
        `Create a Firestore document at admins/${user.uid}, then try again.`,
    );
  }

  return user;
}

export async function signInAdminWithGoogle() {
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    return requireAdminAccess(auth.currentUser);
  }

  if (auth.currentUser?.isAnonymous) {
    await signOut(auth);
  }

  const result = await signInWithPopup(auth, googleProvider);
  return requireAdminAccess(result.user);
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
