import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import Login from "./pages/Login.jsx";
import Problems from "./pages/Problems.jsx";
import Problem from "./pages/Problem.jsx";
import Contests from "./pages/Contests.jsx";
import Contest from "./pages/Contest.jsx";
import Admin from "./pages/Admin.jsx";

function Protected({ children }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
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
              <Protected>
                <Admin />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
