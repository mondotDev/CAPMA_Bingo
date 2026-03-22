import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminPage from "./pages/AdminPage";
import AttendeePage from "./pages/AttendeePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AttendeePage />} path="/" />
        <Route element={<AdminPage />} path="/admin" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </BrowserRouter>
  );
}
