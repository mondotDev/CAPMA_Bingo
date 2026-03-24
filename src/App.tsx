import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute";
import AdminPage from "./pages/AdminPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AttendeePage from "./pages/AttendeePage";

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
