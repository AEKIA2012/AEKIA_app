import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import MainMenuPage from './pages/MainMenuPage'
import SupabaseTestPage from './pages/SupabaseTestPage'
import PersonalDataPage from './pages/PersonalDataPage'
import AttendancePage from './pages/AttendancePage'
import PaymentsPage from './pages/PaymentsPage'
import EventRegistrationPage from './pages/EventRegistrationPage'
import ComplaintsPage from './pages/ComplaintsPage'
import MembersAdminPage from './pages/admin/MembersAdminPage'
import MemberDetailAdminPage from './pages/admin/MemberDetailAdminPage'
import MemberEditAdminPage from './pages/admin/MemberEditAdminPage'
import MemberNewAdminPage from './pages/admin/MemberNewAdminPage'
import AdminAttendancePage from './pages/admin/AdminAttendancePage'
import AdminPaymentsPage from './pages/admin/AdminPaymentsPage'
import AdminEventsPage from './pages/admin/AdminEventsPage'
import AdminComplaintsPage from './pages/admin/AdminComplaintsPage'
import AdminAccessListsPage from './pages/admin/AdminAccessListsPage'
import AdminRolesPage from './pages/admin/AdminRolesPage'
import AdminAuditLogsPage from './pages/admin/AdminAuditLogsPage'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="/login" element={<LoginPage />} />

      <Route path="/register" element={<RegisterPage />} />

      <Route path="/change-password" element={<ChangePasswordPage />} />

      <Route
        path="/menu"
        element={
          <ProtectedRoute>
            <MainMenuPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/supabase-test"
        element={
          <ProtectedRoute>
            <SupabaseTestPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/members"
        element={
          <ProtectedRoute>
            <MembersAdminPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/members/new"
        element={
          <ProtectedRoute>
            <MemberNewAdminPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/members/:memberId"
        element={
          <ProtectedRoute>
            <MemberDetailAdminPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/members/:memberId/edit"
        element={
          <ProtectedRoute>
            <MemberEditAdminPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/personal-data"
        element={
          <ProtectedRoute>
            <PersonalDataPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <AttendancePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/payments"
        element={
          <ProtectedRoute>
            <PaymentsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/event-registration"
        element={
          <ProtectedRoute>
            <EventRegistrationPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/complaints"
        element={
          <ProtectedRoute>
            <ComplaintsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/attendance"
        element={
          <ProtectedRoute>
            <AdminAttendancePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/payments"
        element={
          <ProtectedRoute>
            <AdminPaymentsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/events"
        element={
          <ProtectedRoute>
            <AdminEventsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/complaints"
        element={
          <ProtectedRoute>
            <AdminComplaintsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/access-lists"
        element={
          <ProtectedRoute>
            <AdminAccessListsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/roles"
        element={
          <ProtectedRoute>
            <AdminRolesPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/audit-logs"
        element={
          <ProtectedRoute>
            <AdminAuditLogsPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}