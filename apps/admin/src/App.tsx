import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/Toast";
import { ReauthProvider } from "@/components/Reauth";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { PagesPage } from "@/pages/Pages";
import { PageEditor } from "@/pages/PageEditor";
import { ContentBlocksPage } from "@/pages/ContentBlocks";
import { ProgrammesPage } from "@/pages/Programmes";
import { ProgrammeEditor } from "@/pages/ProgrammeEditor";
import { JobsPage } from "@/pages/resources";
import { ApplicationsPage } from "@/pages/Applications";
import { ApplicationDetail } from "@/pages/ApplicationDetail";
import { EnquiriesPage } from "@/pages/Enquiries";
import { EnquiryDetailPage } from "@/pages/EnquiryDetail";
import { MediaPage } from "@/pages/Media";
import { AdminUsersPage } from "@/pages/AdminUsers";
import { RolesPage } from "@/pages/Roles";
import { SettingsPage } from "@/pages/Settings";
import { AuditPage } from "@/pages/Audit";
import { AccountPage } from "@/pages/Account";

/**
 * Routes mirror the permissions the API enforces.
 *
 * `anyOf` hides a screen the signed-in administrator cannot use, which
 * is a convenience: the server refuses the underlying request whether
 * or not the route is reachable, so nothing here is a security control.
 *
 * Every screen manages something the public website renders. There is
 * no route without a matching API module, and no API module without a
 * route.
 */
export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ReauthProvider />
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="account" element={<AccountPage />} />

              {/* ── Website ────────────────────────────── */}
              <Route
                path="pages"
                element={
                  <ProtectedRoute anyOf={["page:read"]}>
                    <PagesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="pages/:key"
                element={
                  <ProtectedRoute anyOf={["page:read"]}>
                    <PageEditor />
                  </ProtectedRoute>
                }
              />
              <Route
                path="content"
                element={
                  <ProtectedRoute anyOf={["content:read"]}>
                    <ContentBlocksPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="programmes"
                element={
                  <ProtectedRoute anyOf={["programme:read"]}>
                    <ProgrammesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="programmes/:id"
                element={
                  <ProtectedRoute anyOf={["programme:read"]}>
                    <ProgrammeEditor />
                  </ProtectedRoute>
                }
              />
              <Route
                path="media"
                element={
                  <ProtectedRoute anyOf={["media:read"]}>
                    <MediaPage />
                  </ProtectedRoute>
                }
              />

              {/* ── Recruitment ────────────────────────── */}
              <Route
                path="jobs"
                element={
                  <ProtectedRoute anyOf={["job:read"]}>
                    <JobsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="applications"
                element={
                  <ProtectedRoute anyOf={["application:read"]}>
                    <ApplicationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="applications/:id"
                element={
                  <ProtectedRoute anyOf={["application:read"]}>
                    <ApplicationDetail />
                  </ProtectedRoute>
                }
              />

              {/* ── Enquiries ──────────────────────────── */}
              <Route
                path="enquiries"
                element={
                  <ProtectedRoute anyOf={["enquiry:read"]}>
                    <EnquiriesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="enquiries/:id"
                element={
                  <ProtectedRoute anyOf={["enquiry:read"]}>
                    <EnquiryDetailPage />
                  </ProtectedRoute>
                }
              />

              {/* ── Administration ─────────────────────── */}
              <Route
                path="admin-users"
                element={
                  <ProtectedRoute anyOf={["admin:read"]}>
                    <AdminUsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="roles"
                element={
                  <ProtectedRoute anyOf={["role:read"]}>
                    <RolesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="settings"
                element={
                  <ProtectedRoute anyOf={["setting:read"]}>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="audit"
                element={
                  <ProtectedRoute anyOf={["audit:read"]}>
                    <AuditPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
