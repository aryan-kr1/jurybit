import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

function fmt(iso) {
  return new Date(iso).toLocaleString();
}

export default function AdminContests() {
  const [contests, setContests] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const data = await api("/api/contests");
      setContests(data.contests);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onDelete(c) {
    if (
      !window.confirm(
        `Delete "${c.title}"? Its submissions stay but are no longer linked to a contest.`,
      )
    ) {
      return;
    }
    setError("");
    setNotice("");
    try {
      await api(`/api/contests/${c.id}`, { method: "DELETE" });
      setNotice(`Deleted contest #${c.id}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onRebuild(c) {
    setError("");
    setNotice("");
    try {
      await api(`/api/contests/${c.id}/leaderboard/rebuild`, {
        method: "POST",
      });
      setNotice(`Leaderboard of contest #${c.id} rebuilt`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="admin-header">
        <h2>Contests</h2>
        <Link to="/admin/contests/new">New contest</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {!contests && !error && <p>Loading...</p>}
      {contests && contests.length === 0 && <p>No contests yet.</p>}
      {contests && contests.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>State</th>
              <th>Starts</th>
              <th>Ends</th>
              <th>Problems</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {contests.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>{c.title}</td>
                <td>
                  <span className={`badge ${c.state}`}>{c.state}</span>
                </td>
                <td>{fmt(c.starts_at)}</td>
                <td>{fmt(c.ends_at)}</td>
                <td>{c.problem_count}</td>
                <td>
                  <div className="admin-actions">
                    <Link to={`/admin/contests/${c.id}`}>Edit</Link>
                    <button
                      type="button"
                      className="link"
                      onClick={() => onRebuild(c)}
                    >
                      Rebuild board
                    </button>
                    <button
                      type="button"
                      className="link"
                      onClick={() => onDelete(c)}
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
