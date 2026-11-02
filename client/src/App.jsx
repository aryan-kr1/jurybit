import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import Login from "./pages/Login.jsx";
import Problems from "./pages/Problems.jsx";
import Problem from "./pages/Problem.jsx";
import Contests from "./pages/Contests.jsx";
import Contest from "./pages/Contest.jsx";
import Admin from "./pages/Admin.jsx";
import AdminContests from "./pages/AdminContests.jsx";
import AdminContestForm from "./pages/AdminContestForm.jsx";
import AdminProblems from "./pages/AdminProblems.jsx";
import AdminProblemForm from "./pages/AdminProblemForm.jsx";
import AdminTestCases from "./pages/AdminTestCases.jsx";

function Protected({ children }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const { token, isAdmin } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return isAdmin ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { token, isAdmin, logout } = useAuth();

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          Online Judge
        </Link>
        {token && (
          <nav className="nav">
            <Link to="/">Problems</Link>
            <Link to="/contests">Contests</Link>
            {isAdmin && <Link to="/admin">Admin</Link>}
          </nav>
        )}
        {token && (
          <button className="link" onClick={logout}>
            Log out
          </button>
        )}
      </header>
      <main className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Protected>
                <Problems />
              </Protected>
            }
          />
          <Route
            path="/problems/:slug"
            element={
              <Protected>
                <Problem />
              </Protected>
            }
          />
          <Route
            path="/contests"
            element={
              <Protected>
                <Contests />
              </Protected>
            }
          />
          <Route
            path="/contests/:id"
            element={
              <Protected>
                <Contest />
              </Protected>
            }
          />
          <Route
            path="/contests/:contestId/problems/:slug"
            element={
              <Protected>
                <Problem />
              </Protected>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/contests"
            element={
              <AdminRoute>
                <AdminContests />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/contests/new"
            element={
              <AdminRoute>
                <AdminContestForm />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/contests/:id"
            element={
              <AdminRoute>
                <AdminContestForm />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/problems"
            element={
              <AdminRoute>
                <AdminProblems />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/problems/new"
            element={
              <AdminRoute>
                <AdminProblemForm />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/problems/:id"
            element={
              <AdminRoute>
                <AdminProblemForm />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/problems/:id/tests"
            element={
              <AdminRoute>
                <AdminTestCases />
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
