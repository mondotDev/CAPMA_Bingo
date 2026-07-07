import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute";
import { AppAuthProvider } from "./features/auth/appAuth";
import AdminPage from "./pages/AdminPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AttendeePage from "./pages/AttendeePage";
import SponsorsPage from "./pages/SponsorsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <AppAuthProvider>
              <AttendeePage />
            </AppAuthProvider>
          }
          path="/"
        />
        <Route element={<SponsorsPage />} path="/sponsor" />
        <Route element={<SponsorsPage />} path="/sponsors" />
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
    </BrowserRouter>
  );
}
