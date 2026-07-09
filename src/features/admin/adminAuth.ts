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

const ADMIN_EMAIL_DOMAINS = ["capma.org", "connerlyandassociates.com"];
const PROVIDER_ALREADY_LINKED_ERROR = "auth/provider-already-linked";
const ADMIN_VERIFIED_EMAIL_KEY = "capma-admin-verified-email";

function isAllowedAdminEmail(email?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();

  return Boolean(
    normalizedEmail
    && ADMIN_EMAIL_DOMAINS.some((domain) => normalizedEmail.endsWith(`@${domain}`)),
  );
}

function getStoredAdminEmail(user: User | null) {
  if (!user) {
    return "";
  }

  try {
    const storedAdmin = window.sessionStorage.getItem(ADMIN_VERIFIED_EMAIL_KEY);

    if (!storedAdmin) {
      return "";
    }

    const parsedAdmin = JSON.parse(storedAdmin) as {
      uid?: unknown;
      email?: unknown;
    };

    if (parsedAdmin.uid !== user.uid || typeof parsedAdmin.email !== "string") {
      return "";
    }

    return parsedAdmin.email;
  } catch {
    return "";
  }
}

function storeVerifiedAdminEmail(user: User, email: string) {
  window.sessionStorage.setItem(
    ADMIN_VERIFIED_EMAIL_KEY,
    JSON.stringify({
      uid: user.uid,
      email,
    }),
  );
}

export function isCapmaAdminUser(user: User | null) {
  return (
    isAllowedAdminEmail(user?.email)
    || isAllowedAdminEmail(user ? getUserProviderEmail(user) : "")
    || isAllowedAdminEmail(getStoredAdminEmail(user))
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

function getCurrentAuthDetail() {
  return [
    auth.currentUser
      ? `current user: ${auth.currentUser.uid} (${auth.currentUser.isAnonymous ? "anonymous" : "not anonymous"})`
      : "current user: none",
    auth.currentUser?.email ? `email: ${auth.currentUser.email}` : "",
    auth.currentUser?.providerData.length
      ? `providers: ${auth.currentUser.providerData.map((provider) => provider.providerId).join(", ")}`
      : "",
  ].filter(Boolean).join("; ");
}

function getUserProviderEmail(user: User) {
  const providerEmail = user.providerData.find((provider) => provider.email)?.email;

  return providerEmail?.trim().toLowerCase() || "";
}

function getAdminEmailDebugDetail(user: User) {
  return [
    `firebase email: ${user.email || "none"}`,
    `provider email: ${getUserProviderEmail(user) || "none"}`,
    `stored email: ${getStoredAdminEmail(user) || "none"}`,
    user.providerData.length
      ? `providers: ${user.providerData.map((provider) => provider.providerId).join(", ")}`
      : "providers: none",
  ].filter(Boolean).join("; ");
}

async function requireAdminAccess(user: User, verifiedEmail?: string) {
  const email = (
    verifiedEmail?.trim()
    || user.email?.trim()
    || getUserProviderEmail(user)
    || getStoredAdminEmail(user)
  );

  if (!isAllowedAdminEmail(email)) {
    const displayEmail = email || "an unknown email";
    const debugDetail = getAdminEmailDebugDetail(user);

    await signOut(auth);
    throw new Error(
      `Signed in as ${displayEmail}. Use a CAPMA or Connerly & Associates Google account to access CAPMA admin. Details: ${debugDetail}.`,
    );
  }

  storeVerifiedAdminEmail(user, email);

  const adminAllowed = await hasAdminRecord(user);

  if (!adminAllowed) {
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

  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  provider.setCustomParameters({
    prompt: "select_account",
  });

  try {
    const result = await signInWithPopup(auth, provider);
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
        "Firebase rejected the Google credential as already linked, but no reusable signed-in user was exposed. "
          + getCurrentAuthDetail(),
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
