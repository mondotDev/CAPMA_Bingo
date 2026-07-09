import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth } from "../../lib/firebase";
import { db } from "../../lib/firebase";

const ADMIN_EMAIL_DOMAINS = ["capma.org", "connerlyandassociates.com"];
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_IDENTITY_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const PROVIDER_ALREADY_LINKED_ERROR = "auth/provider-already-linked";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleIdentityServices = {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string;
        callback: (response: GoogleTokenResponse) => void;
        scope: string;
      }) => GoogleTokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

let googleIdentityScriptReady: Promise<void> | null = null;

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

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  if (!googleIdentityScriptReady) {
    googleIdentityScriptReady = new Promise((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        `script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`,
      );

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("Google sign-in script failed to load.")),
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.async = true;
      script.defer = true;
      script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener(
        "error",
        () => reject(new Error("Google sign-in script failed to load.")),
        { once: true },
      );
      document.head.appendChild(script);
    });
  }

  return googleIdentityScriptReady;
}

async function getGoogleAccessToken() {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error(
      "Google sign-in is missing VITE_GOOGLE_CLIENT_ID. Add the Firebase Google provider Web client ID to .env.local, rebuild, and redeploy.",
    );
  }

  await loadGoogleIdentityScript();

  const oauth2 = window.google?.accounts?.oauth2;

  if (!oauth2) {
    throw new Error("Google sign-in did not initialize.");
  }

  return new Promise<string>((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "openid email profile",
      callback: (response) => {
        if (response.error) {
          reject(
            new Error(
              response.error_description || `Google sign-in failed: ${response.error}`,
            ),
          );
          return;
        }

        if (!response.access_token) {
          reject(new Error("Google sign-in did not return an access token."));
          return;
        }

        resolve(response.access_token);
      },
    });

    tokenClient.requestAccessToken({ prompt: "select_account" });
  });
}

export async function signInAdminWithGoogle() {
  await auth.authStateReady();

  if (auth.currentUser) {
    await signOut(auth);
    await auth.authStateReady();
  }

  const accessToken = await getGoogleAccessToken();
  const credential = GoogleAuthProvider.credential(null, accessToken);

  try {
    const result = await signInWithCredential(auth, credential);
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
