import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";

// ISO string from the server -> value for <input type="datetime-local">
function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function AdminContestForm() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();

  const [allProblems, setAllProblems] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [selected, setSelected] = useState([]);
  const [state, setState] = useState("upcoming");
  const [toAdd, setToAdd] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const probs = await api("/api/problems");
        if (cancelled) return;
        setAllProblems(probs.problems);
        if (!isNew) {
          const data = await api(`/api/contests/${id}`);
          if (cancelled) return;
          const c = data.contest;
          setTitle(c.title);
          setDescription(c.description || "");
          setStartsAt(toLocalInput(c.starts_at));
          setEndsAt(toLocalInput(c.ends_at));
          setState(c.state);
          setSelected(
            [...data.problems]
              .sort((a, b) => a.position - b.position)
              .map((p) => p.problem_id),
          );
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const started = state === "running" || state === "ended";
  const ended = state === "ended";

  function addProblem() {
    if (!toAdd) return;
    setSelected([...selected, Number(toAdd)]);
    setToAdd("");
  }

  function removeProblem(index) {
    setSelected(selected.filter((_, i) => i !== index));
  }

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target], next[index]];
    setSelected(next);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        description,
        ends_at: new Date(endsAt).toISOString(),
      };
      // After the start the server only allows title, description and end time.
      if (!started) {
        body.starts_at = new Date(startsAt).toISOString();
        body.problem_ids = selected;
      }
      if (isNew) {
        await api("/api/contests", { method: "POST", body });
      } else {
        await api(`/api/contests/${id}`, { method: "PUT", body });
      }
      navigate("/admin/contests");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading...</p>;

  const byId = new Map(allProblems.map((p) => [p.id, p]));
  const available = allProblems.filter((p) => !selected.includes(p.id));

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>{isNew ? "New contest" : `Edit contest #${id}`}</h2>
      {ended && (
        <p className="meta">
          This contest has ended, so it can no longer be changed.
        </p>
      )}
      {state === "running" && (
        <p className="meta">
          This contest is running: only the title, description and end time can
          be changed.
        </p>
      )}

      <label>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          disabled={ended}
        />
      </label>
      <label>
        Description
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={5000}
          disabled={ended}
        />
      </label>
      <label>
        Starts at
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
          disabled={started}
        />
      </label>
      <label>
        Ends at
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          required
          disabled={ended}
        />
      </label>
      <p className="meta">Times are in your browser's time zone.</p>

      <h3>Problems</h3>
      {selected.length === 0 && <p className="meta">No problems added yet.</p>}
      {selected.map((pid, i) => {
        const p = byId.get(pid);
        return (
          <div className="picker-row" key={pid}>
            <span className="picker-label">{String.fromCharCode(65 + i)}</span>
            <span className="picker-grow">
              {p ? `${p.title} (${p.slug})` : `Problem #${pid}`}
            </span>
            {!started && (
              <>
                <button
                  type="button"
                  className="link"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="link"
                  onClick={() => move(i, 1)}
                  disabled={i === selected.length - 1}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="link"
                  onClick={() => removeProblem(i)}
                >
                  Remove
                </button>
              </>
            )}
          </div>
        );
      })}
      {!started && (
        <div className="picker-row">
          <select
            value={toAdd}
            onChange={(e) => setToAdd(e.target.value)}
            disabled={available.length === 0 || selected.length >= 26}
          >
            <option value="">Add a problem...</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.slug})
              </option>
            ))}
          </select>
          <button type="button" onClick={addProblem} disabled={!toAdd}>
            Add
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div className="admin-actions">
        <button type="submit" disabled={saving || ended}>
          {saving ? "Saving..." : "Save"}
        </button>
        <Link to="/admin/contests">Cancel</Link>
      </div>
    </form>
  );
}
