// src/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import Spinner from "@/components/Spinner"; // Import the spinner component

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();

  if (loading) {
    // If the session is still loading, show a loading spinner
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  if (!session) {
    // If loading is finished and there's no session, redirect to login
    return <Navigate to="/login" replace />;
  }

  // Session exists, render the protected content
  return <>{children}</>;
}