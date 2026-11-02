import { Navigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function Admin() {
  const { isAdmin } = useAuth();

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="card">
      <h2>Admin</h2>
      <p className="meta">
        Contests, problems and test cases will be managed from here.
      </p>
    </div>
  );
}
