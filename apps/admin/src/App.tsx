import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/Toast";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { EnquiriesPage, EnquiryDetailPage } from "@/pages/Enquiries";
import { MediaPage } from "@/pages/Media";
import { AdminUsersPage } from "@/pages/AdminUsers";
import { RolesPage } from "@/pages/Roles";
import { AuditPage } from "@/pages/Audit";
import { AccountPage } from "@/pages/Account";
import {
  AudiencesPage, CareerPage, ContentPage, FaqsPage, ProgrammesPage, StatisticsPage,
} from "@/pages/resources";

/**
 * Routes mirror the permissions the API enforces. Hiding a screen is
 * convenience only; the server refuses the call regardless.
 */
export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
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

              <Route path="content" element={<ProtectedRoute anyOf={["content:read"]}><ContentPage /></ProtectedRoute>} />
              <Route path="programmes" element={<ProtectedRoute anyOf={["programme:read"]}><ProgrammesPage /></ProtectedRoute>} />
              <Route path="faqs" element={<ProtectedRoute anyOf={["faq:read"]}><FaqsPage /></ProtectedRoute>} />
              <Route path="statistics" element={<ProtectedRoute anyOf={["statistic:read"]}><StatisticsPage /></ProtectedRoute>} />
              <Route path="audiences" element={<ProtectedRoute anyOf={["audience:read"]}><AudiencesPage /></ProtectedRoute>} />
              <Route path="career" element={<ProtectedRoute anyOf={["career:read"]}><CareerPage /></ProtectedRoute>} />
              <Route path="media" element={<ProtectedRoute anyOf={["media:read"]}><MediaPage /></ProtectedRoute>} />

              <Route path="enquiries" element={<ProtectedRoute anyOf={["enquiry:read"]}><EnquiriesPage /></ProtectedRoute>} />
              <Route path="enquiries/:id" element={<ProtectedRoute anyOf={["enquiry:read"]}><EnquiryDetailPage /></ProtectedRoute>} />

              <Route path="admin-users" element={<ProtectedRoute anyOf={["admin:read"]}><AdminUsersPage /></ProtectedRoute>} />
              <Route path="roles" element={<ProtectedRoute anyOf={["role:read"]}><RolesPage /></ProtectedRoute>} />
              <Route path="audit" element={<ProtectedRoute anyOf={["audit:read"]}><AuditPage /></ProtectedRoute>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
