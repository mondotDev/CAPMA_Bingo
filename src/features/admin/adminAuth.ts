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
const ADMIN_VERIFIED_EMAIL_KEY = "capma-admin-verified-email";

type GoogleTokenResponse = {
  access_token?: string;
  credential?: string;
  error?: string;
  error_description?: string;
};

type GoogleIdentityServices = {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: GoogleTokenResponse) => void;
        prompt?: string;
      }) => {
        requestAccessToken: () => void;
      };
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

let googleIdentityScriptReady: Promise<void> | null = null;

type GoogleIdTokenClaims = {
  email?: unknown;
  hd?: unknown;
};

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

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const decoded = window.atob(paddedBase64);
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

function getGoogleIdTokenClaims(idToken: string) {
  const [, payload] = idToken.split(".");

  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(payload)) as GoogleIdTokenClaims;
  } catch {
    return null;
  }
}

function getEmailFromGoogleIdToken(idToken: string) {
  const claims = getGoogleIdTokenClaims(idToken);

  return typeof claims?.email === "string" ? claims.email.trim().toLowerCase() : "";
}

function getUserProviderEmail(user: User) {
  const providerEmail = user.providerData.find((provider) => provider.email)?.email;

  return providerEmail?.trim().toLowerCase() || "";
}

function getAdminEmailDebugDetail(user: User, idToken?: string) {
  const tokenParts = idToken ? idToken.split(".").length : 0;
  const claims = idToken ? getGoogleIdTokenClaims(idToken) : null;
  const claimKeys = claims ? Object.keys(claims).sort() : [];

  return [
    `firebase email: ${user.email || "none"}`,
    `provider email: ${getUserProviderEmail(user) || "none"}`,
    `stored email: ${getStoredAdminEmail(user) || "none"}`,
    `Google ID token parts: ${tokenParts}`,
    `Google token has email claim: ${typeof claims?.email === "string" ? "yes" : "no"}`,
    typeof claims?.hd === "string" ? `Google hosted domain: ${claims.hd}` : "",
    claimKeys.length ? `Google claim keys: ${claimKeys.join(", ")}` : "Google claim keys: none",
  ].filter(Boolean).join("; ");
}

async function requireAdminAccess(user: User, verifiedEmail?: string, idToken?: string) {
  const email = (
    verifiedEmail?.trim()
    || user.email?.trim()
    || getUserProviderEmail(user)
    || getStoredAdminEmail(user)
  );

  if (!isAllowedAdminEmail(email)) {
    const displayEmail = email || "an unknown email";
    const debugDetail = getAdminEmailDebugDetail(user, idToken);

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

  const googleOAuth = window.google?.accounts?.oauth2;

  if (!googleOAuth) {
    throw new Error("Google sign-in did not initialize.");
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error("Google sign-in did not finish. Close the Google popup if it is still open, then try again."));
    }, 30000);

    const tokenClient = googleOAuth.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "openid email profile",
      prompt: "select_account",
      callback: (response) => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);

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

    tokenClient.requestAccessToken();
  });
}

async function getGoogleUserInfoEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return "";
  }

  const userInfo = await response.json() as {
    email?: unknown;
  };

  return typeof userInfo.email === "string" ? userInfo.email.trim().toLowerCase() : "";
}

export async function signInAdminWithGoogle() {
  await auth.authStateReady();

  if (auth.currentUser) {
    await signOut(auth);
    await auth.authStateReady();
  }

  const accessToken = await getGoogleAccessToken();
  const verifiedEmail = await getGoogleUserInfoEmail(accessToken);
  const credential = GoogleAuthProvider.credential(null, accessToken);

  try {
    const result = await signInWithCredential(auth, credential);
    return requireAdminAccess(result.user, verifiedEmail);
  } catch (error) {
    await auth.authStateReady();

    if (
      isFirebaseAuthError(error, PROVIDER_ALREADY_LINKED_ERROR)
      && auth.currentUser
    ) {
      return requireAdminAccess(auth.currentUser, verifiedEmail);
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
