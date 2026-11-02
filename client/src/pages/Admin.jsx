import { Link } from "react-router-dom";

export default function Admin() {
  return (
    <div className="card">
      <h2>Admin</h2>
      <p>
        <Link to="/admin/contests">Contests</Link>
      </p>
      <p>
        <Link to="/admin/problems">Problems</Link>
      </p>
      <p className="meta">
        Test cases are managed from the Tests link in the problem list.
      </p>
    </div>
  );
}
