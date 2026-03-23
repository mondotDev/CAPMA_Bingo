import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from "firebase/auth";
import { auth } from "../../lib/firebase";

type AppAuthContextValue = {
  authReady: boolean;
  authError: string | null;
  user: User | null;
};

const AppAuthContext = createContext<AppAuthContextValue | null>(null);

export function AppAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    console.info("[auth] initialization start");

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser) {
        console.info("[auth] auth ready", {
          uid: nextUser.uid,
          isAnonymous: nextUser.isAnonymous,
          email: nextUser.email ?? null,
        });
        setUser(nextUser);
        setAuthReady(true);
        setAuthError(null);
        return;
      }

      try {
        console.info("[auth] no user found, signing in anonymously");
        const credential = await signInAnonymously(auth);
        console.info("[auth] anonymous sign-in success", {
          uid: credential.user.uid,
        });
        setUser(credential.user);
        setAuthReady(true);
        setAuthError(null);
      } catch (error) {
        console.error("[auth] anonymous sign-in failed", error);
        setUser(null);
        setAuthReady(true);
        setAuthError(
          error instanceof Error
            ? error.message
            : "Anonymous sign-in failed.",
        );
      }
    });

    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({
      authReady,
      authError,
      user,
    }),
    [authError, authReady, user],
  );

  return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>;
}

export function useAppAuth() {
  const context = useContext(AppAuthContext);

  if (!context) {
    throw new Error("useAppAuth must be used within AppAuthProvider.");
  }

  return context;
}
