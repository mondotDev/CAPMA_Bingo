import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

const ProtectedAdminRoute = lazy(() => import("./components/ProtectedAdminRoute"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const AttendeePage = lazy(() => import("./pages/AttendeePage"));

function RouteLoadingScreen() {
  return (
    <main className="app-shell">
      <section className="surface-card">
        <p className="eyebrow">Loading</p>
        <h1 className="display-title">CAPMA Bingo</h1>
        <p className="body-copy">Preparing the next view.</p>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoadingScreen />}>
        <Routes>
          <Route element={<AttendeePage />} path="/" />
          <Route element={<AdminLoginPage />} path="/admin-login" />
          <Route
            element={
              <ProtectedAdminRoute>
                <AdminPage />
              </ProtectedAdminRoute>
            }
            path="/admin"
          />
          <Route element={<Navigate replace to="/" />} path="*" />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
