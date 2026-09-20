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
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser) {
        setUser(nextUser);
        setAuthReady(true);
        setAuthError(null);
        return;
      }

      try {
        const credential = await signInAnonymously(auth);
        setUser(credential.user);
        setAuthReady(true);
        setAuthError(null);
      } catch (error) {
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
