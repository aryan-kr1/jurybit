import { Link } from "react-router-dom";

export default function Admin() {
  return (
    <div className="card">
      <h2>Admin</h2>
      <p>
        <Link to="/admin/contests">Contests</Link>
      </p>
      <p className="meta">Problems and test cases will be added here next.</p>
    </div>
  );
}
