import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

export default function AdminProblems() {
  const [problems, setProblems] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const data = await api("/api/problems");
      setProblems(data.problems);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onDelete(p) {
    if (
      !window.confirm(
        `Delete "${p.title}"? This also deletes its test cases and every submission to it, and removes it from any contest.`,
      )
    ) {
      return;
    }
    setError("");
    setNotice("");
    try {
      await api(`/api/problems/${p.id}`, { method: "DELETE" });
      setNotice(`Deleted problem #${p.id}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="admin-header">
        <h2>Problems</h2>
        <Link to="/admin/problems/new">New problem</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {!problems && !error && <p>Loading...</p>}
      {problems && problems.length === 0 && <p>No problems yet.</p>}
      {problems && problems.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Slug</th>
              <th>Title</th>
              <th>Difficulty</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.slug}</td>
                <td>{p.title}</td>
                <td>{p.difficulty}</td>
                <td>
                  <div className="admin-actions">
                    <Link to={`/admin/problems/${p.id}`}>Edit</Link>
                    <button
                      type="button"
                      className="link"
                      onClick={() => onDelete(p)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
