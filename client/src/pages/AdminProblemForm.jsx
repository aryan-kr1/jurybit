import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";

export default function AdminProblemForm() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();

  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [difficulty, setDifficulty] = useState("easy");
  const [timeLimit, setTimeLimit] = useState("2000");
  const [memoryLimit, setMemoryLimit] = useState("256");
  const [referenceSolution, setReferenceSolution] = useState("");
  const [testGenerator, setTestGenerator] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await api(`/api/problems/${id}/full`);
        if (cancelled) return;
        const p = data.problem;
        setSlug(p.slug);
        setTitle(p.title);
        setStatement(p.statement);
        setDifficulty(p.difficulty);
        setTimeLimit(String(p.time_limit_ms));
        setMemoryLimit(String(p.memory_limit_mb));
        setReferenceSolution(p.reference_solution || "");
        setTestGenerator(p.test_generator || "");
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

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const body = {
        slug: slug.trim(),
        title: title.trim(),
        statement,
        difficulty,
        time_limit_ms: Number(timeLimit),
        memory_limit_mb: Number(memoryLimit),
        reference_solution: referenceSolution.trim() ? referenceSolution : null,
        test_generator: testGenerator.trim() ? testGenerator : null,
      };
      if (isNew) {
        await api("/api/problems", { method: "POST", body });
      } else {
        await api(`/api/problems/${id}`, { method: "PUT", body });
      }
      navigate("/admin/problems");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>{isNew ? "New problem" : `Edit problem #${id}`}</h2>

      <label>
        Slug
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          maxLength={100}
          required
        />
      </label>
      {!isNew && (
        <p className="meta">
          Keep the slug the same as the folder name in problems/, because
          seed.py finds problems by slug.
        </p>
      )}
      <label>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </label>
      <label>
        Statement
        <textarea
          rows={12}
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          required
        />
      </label>
      <label>
        Difficulty
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          <option value="easy">easy</option>
          <option value="medium">medium</option>
          <option value="hard">hard</option>
        </select>
      </label>
      <label>
        Time limit (ms, 100 to 10000)
        <input
          type="number"
          value={timeLimit}
          onChange={(e) => setTimeLimit(e.target.value)}
          required
        />
      </label>
      <label>
        Memory limit (MB, 16 to 1024)
        <input
          type="number"
          value={memoryLimit}
          onChange={(e) => setMemoryLimit(e.target.value)}
          required
        />
      </label>
      <label>
        Reference solution
        <textarea
          className="code-area"
          rows={10}
          value={referenceSolution}
          onChange={(e) => setReferenceSolution(e.target.value)}
        />
      </label>
      <label>
        Test generator
        <textarea
          className="code-area"
          rows={10}
          value={testGenerator}
          onChange={(e) => setTestGenerator(e.target.value)}
        />
      </label>

      {error && <p className="error">{error}</p>}
      <div className="admin-actions">
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
        <Link to="/admin/problems">Cancel</Link>
      </div>
    </form>
  );
}
