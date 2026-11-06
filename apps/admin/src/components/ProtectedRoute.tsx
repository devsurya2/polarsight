import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Loading } from "./ui";

/**
 * Gate for authenticated routes. `anyOf` additionally requires one of
 * the listed permissions; the API enforces the same rule, so hiding a
 * screen here is convenience rather than the actual control.
 */
export function ProtectedRoute({
  children,
  anyOf,
}: {
  children: ReactNode;
  anyOf?: string[];
}) {
  const { user, loading, canAny } = useAuth();
  const location = useLocation();

  if (loading) return <Loading label="Checking your session" />;

  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  if (anyOf && !canAny(...anyOf)) {
    return (
      <div className="panel px-6 py-14 text-center">
        <p className="text-sm font-medium">You do not have access to that area</p>
        <p className="mt-1 text-sm text-faint">
          Your role is {user.role}. Ask a Super Admin if you need access.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
