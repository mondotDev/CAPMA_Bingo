import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAdminAuth } from "../features/admin/adminAuth";

type ProtectedAdminRouteProps = {
  children: ReactNode;
};

export default function ProtectedAdminRoute({
  children,
}: ProtectedAdminRouteProps) {
  const { isAdmin, loading } = useAdminAuth();

  if (loading) {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <p className="eyebrow">Checking Access</p>
          <h1 className="section-title">CAPMA Admin</h1>
          <p className="body-copy">Verifying your admin session...</p>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return <Navigate replace to="/admin-login" />;
  }

  return <>{children}</>;
}
