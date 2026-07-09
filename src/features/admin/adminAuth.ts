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
const PROVIDER_ALREADY_LINKED_ERROR = "auth/provider-already-linked";

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

function isFirebaseAuthError(error: unknown, code: string) {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === code
  );
}

function getAuthErrorDetail(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return "";
  }

  const firebaseError = error as {
    code?: unknown;
    customData?: {
      email?: unknown;
    };
  };
  const details = [
    typeof firebaseError.code === "string" ? `code: ${firebaseError.code}` : "",
    typeof firebaseError.customData?.email === "string"
      ? `email: ${firebaseError.customData.email}`
      : "",
    auth.currentUser
      ? `current user: ${auth.currentUser.uid} (${auth.currentUser.isAnonymous ? "anonymous" : "not anonymous"})`
      : "current user: none",
    auth.currentUser?.providerData.length
      ? `providers: ${auth.currentUser.providerData.map((provider) => provider.providerId).join(", ")}`
      : "",
  ].filter(Boolean);

  return details.length ? ` Details: ${details.join("; ")}.` : "";
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
  await auth.authStateReady();

  if (auth.currentUser) {
    await signOut(auth);
    await auth.authStateReady();
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return requireAdminAccess(result.user);
  } catch (error) {
    await auth.authStateReady();

    if (
      isFirebaseAuthError(error, PROVIDER_ALREADY_LINKED_ERROR)
      && auth.currentUser
    ) {
      return requireAdminAccess(auth.currentUser);
    }

    if (isFirebaseAuthError(error, PROVIDER_ALREADY_LINKED_ERROR)) {
      throw new Error(
        "Firebase says this Google provider is already linked, but it did not expose a reusable signed-in admin user."
          + getAuthErrorDetail(error),
      );
    }

    throw error;
  }
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
