// src/App.tsx
import { Route, Routes, Navigate, useLocation } from "react-router-dom";
import MapPage from "@/pages/MapPage";
import TrendsPage from "@/pages/TrendsPage";
import MonitorPage from "@/pages/MonitorPage";
import DashboardPage from "@/pages/DashboardPage";
import Header from "@/components/ui/Header";
import Login from "./pages/Login";
import BottomNav from "@/components/BottomNav";
import ProtectedRoute from "@/components/ProtectedRoute";
import ParameterDetailPage from "@/pages/ParameterDetailPage";
import SpatialDeltaDetailPage from "@/pages/SpatialDeltaDetail";


export default function App() {
  const { pathname } = useLocation();
  const mainClass = pathname === "/" ? "p-0" : "px-4 sm:px-6 lg:px-8 py-4 pb-24 sm:pb-6";
  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <main className={mainClass}>
        <Routes>
          <Route
            path="/"
            element={<ProtectedRoute><MapPage /></ProtectedRoute>}
          />
          <Route
            path="/login"
            element={<Login />}
          />
          <Route
            path="/trends"
            element={<ProtectedRoute><TrendsPage /></ProtectedRoute>}
          />
          <Route
            path="/monitor"
            element={<ProtectedRoute><MonitorPage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard"
            element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="/parameter/:buoyId/:paramId" element={<ParameterDetailPage />} />
          <Route path="/alerts/spatial/:alertId" element={<SpatialDeltaDetailPage />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}