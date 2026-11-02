import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminTestCases() {
  const { id } = useParams();

  const [problem, setProblem] = useState(null);
  const [tests, setTests] = useState(null);
  const [input, setInput] = useState("");
  const [expected, setExpected] = useState("");
  const [isSample, setIsSample] = useState(false);
  const [position, setPosition] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadTests() {
    const data = await api(`/api/problems/${id}/test-cases/summary`);
    setTests(data.test_cases);
    const maxPos = data.test_cases.reduce((m, t) => Math.max(m, t.position), 0);
    setPosition(String(maxPos + 1));
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const p = await api(`/api/problems/${id}/full`);
        if (cancelled) return;
        setProblem(p.problem);
        await loadTests();
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onAdd(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const data = await api(`/api/problems/${id}/test-cases`, {
        method: "POST",
        body: {
          input,
          expected_output: expected,
          is_sample: isSample,
          position: Number(position),
        },
      });
      setNotice(`Added test case #${data.test_case.id}`);
      setInput("");
      setExpected("");
      setIsSample(false);
      await loadTests();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(t) {
    if (!window.confirm(`Delete test case #${t.id}?`)) return;
    setError("");
    setNotice("");
    try {
      await api(`/api/problems/${id}/test-cases/${t.id}`, {
        method: "DELETE",
      });
      setNotice(`Deleted test case #${t.id}`);
      await loadTests();
    } catch (err) {
      setError(err.message);
    }
  }

  const sampleCount = tests ? tests.filter((t) => t.is_sample).length : 0;

  return (
    <div className="card">
      <div className="admin-header">
        <h2>
          Test cases{problem ? `: ${problem.title} (${problem.slug})` : ""}
        </h2>
        <Link to="/admin/problems">Back to problems</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {!tests && !error && <p>Loading...</p>}

      {tests && (
        <>
          <p className="meta">
            {tests.length} tests, {sampleCount} shown to users as samples.
            Judging runs the tests in position order and stops at the first
            failure.
          </p>
          {tests.length > 0 && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Position</th>
                  <th>Sample</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Input preview</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.position}</td>
                    <td>{t.is_sample ? "yes" : ""}</td>
                    <td>{fmtBytes(t.input_bytes)}</td>
                    <td>{fmtBytes(t.output_bytes)}</td>
                    <td>
                      <code className="preview">
                        {t.input_preview.replace(/\n/g, " ⏎ ")}
                      </code>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link"
                        onClick={() => onDelete(t)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <form onSubmit={onAdd}>
        <h3>Add a test case</h3>
        <label>
          Input
          <textarea
            className="code-area"
            rows={6}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            required
          />
        </label>
        <label>
          Expected output
          <textarea
            className="code-area"
            rows={4}
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            required
          />
        </label>
        <label>
          Position
          <input
            type="number"
            min="0"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            required
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={isSample}
            onChange={(e) => setIsSample(e.target.checked)}
          />{" "}
          Show as a sample on the problem page
        </label>
        <p className="meta">
          Big generated tests should still go through seed.py. This form is for
          small hand-written cases.
        </p>
        <button type="submit" disabled={saving}>
          {saving ? "Adding..." : "Add test case"}
        </button>
      </form>
    </div>
  );
}
