import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  signInAdminWithGoogle,
  useAdminAuth,
} from "../features/admin/adminAuth";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAdminAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "CAPMA Bingo | Admin Login";
  }, []);

  async function handleSignIn() {
    setSubmitting(true);
    setError(null);

    try {
      await signInAdminWithGoogle();
      navigate("/admin", { replace: true });
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Google sign-in was not completed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <p className="eyebrow">Loading</p>
          <h1 className="section-title">CAPMA Admin Login</h1>
          <p className="body-copy">Checking your current sign-in status...</p>
        </section>
      </main>
    );
  }

  if (isAdmin) {
    return <Navigate replace to="/admin" />;
  }

  return (
    <main className="admin-auth-shell">
      <section className="admin-auth-card">
        <div className="space-y-2 text-center">
          <p className="eyebrow">CAPMA Admin</p>
          <h1 className="section-title">CAPMA Admin Login</h1>
          <p className="body-copy">
            Sign in with your CAPMA Google account to view admin dashboard data.
          </p>
          <p className="status-note">CAPMA email addresses only.</p>
        </div>

        {error ? <p className="status-message">{error}</p> : null}

        <button
          className="button-primary"
          disabled={submitting}
          onClick={() => void handleSignIn()}
          type="button"
        >
          {submitting ? "Signing In..." : "Sign in with Google"}
        </button>
      </section>
    </main>
  );
}
