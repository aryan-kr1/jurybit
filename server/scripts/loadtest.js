"use strict";

// Load test: simulates a contest where many users submit Python solutions.
// Run it from the server folder:   node scripts/loadtest.js
//
// Settings (environment variables):
//   OJ_ADMIN_EMAIL, OJ_ADMIN_PASSWORD   admin account (required)
//   OJ_BASE_URL      default http://localhost:3000
//   USERS            simulated users, default 20
//   SUBS_PER_USER    submissions per user, default 3
//   SPREAD_SECONDS   each submission starts at a random moment inside this
//                    window, default 60
//   KEEP=1           keep the test users and the contest afterwards

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { Client } = require("pg");
const bcrypt = require("bcryptjs");

const BASE = (process.env.OJ_BASE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const ADMIN_EMAIL = process.env.OJ_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.OJ_ADMIN_PASSWORD;
const KEEP = process.env.KEEP === "1";

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`${name} must be a positive integer`);
    process.exit(1);
  }
  return n;
}

const USERS = intEnv("USERS", 20);
const SUBS_PER_USER = intEnv("SUBS_PER_USER", 3);
const SPREAD_SECONDS = intEnv("SPREAD_SECONDS", 60);

const POLL_MS = 1000;
const VERDICT_TIMEOUT_MS = 30 * 60 * 1000;
const SLUGS = ["add-two-numbers", "sum-of-array", "two-sum-exists"];
const USER_CLEANUP_SQL =
  "DELETE FROM users WHERE username ~ '^lt_user_[0-9]+$'";

const KINDS = {
  correct: { expect: "Accepted" },
  wrong: { expect: "Wrong Answer", code: "print(0)\n" },
  tle: { expect: "Time Limit Exceeded", code: "while True:\n    pass\n" },
};

function pickKind() {
  const r = Math.random();
  return r < 0.7 ? "correct" : r < 0.9 ? "wrong" : "tle";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (ms) => `${(ms / 1000).toFixed(1)}s`;

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, idx))];
}

function stats(values) {
  if (values.length === 0) return "no data";
  const s = [...values].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return (
    `min ${fmt(s[0])}   p50 ${fmt(percentile(s, 50))}   ` +
    `p95 ${fmt(percentile(s, 95))}   max ${fmt(s[s.length - 1])}   ` +
    `mean ${fmt(mean)}`
  );
}

async function api(pathname, { method = "GET", token, body } = {}) {
  let res;
  try {
    res = await fetch(BASE + pathname, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(`request to ${pathname} failed: ${err.message}`);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty or non-JSON body
  }
  return { status: res.status, data };
}

async function login(email, password) {
  const r = await api("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (r.status !== 200 || !r.data || !r.data.token) {
    throw new Error(`login failed for ${email} (status ${r.status})`);
  }
  return r.data.token;
}

async function waitForVerdict(token, id, startedAt) {
  while (Date.now() - startedAt < VERDICT_TIMEOUT_MS) {
    await sleep(POLL_MS);
    try {
      const r = await api(`/api/submissions/${id}`, { token });
      if (r.status === 200 && r.data) {
        const s = r.data.submission || r.data;
        if (s.status && s.status !== "Queued" && s.status !== "Running") {
          return s.status;
        }
      }
    } catch {
      // temporary network error: try again on the next poll
    }
  }
  return "TIMEOUT";
}

function boardMap(board) {
  return new Map(
    board.rows.map((row) => [
      row.user_id,
      { solved: row.solved, penalty: row.penalty, rank: row.rank },
    ]),
  );
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("Set OJ_ADMIN_EMAIL and OJ_ADMIN_PASSWORD first.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing (it is read from server/.env).");
    process.exit(1);
  }

  const solutions = {};
  for (const slug of SLUGS) {
    const file = path.join(
      __dirname,
      "..",
      "..",
      "problems",
      slug,
      "solution.py",
    );
    solutions[slug] = fs.readFileSync(file, "utf8");
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  let contestId = null;
  let adminToken = null;
  let allChecksPassed = true;

  try {
    adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

    // Problem ids by slug
    const list = await api("/api/problems", { token: adminToken });
    if (list.status !== 200) throw new Error("could not list problems");
    const problemIds = {};
    for (const slug of SLUGS) {
      const p = list.data.problems.find((x) => x.slug === slug);
      if (!p) throw new Error(`problem "${slug}" is missing; run seed.py`);
      problemIds[slug] = p.id;
    }

    // Users: removed first in case an earlier run was interrupted
    await db.query(USER_CLEANUP_SQL);
    const password = crypto.randomBytes(9).toString("hex");
    const hash = await bcrypt.hash(password, 10);
    const users = [];
    process.stdout.write(`Creating ${USERS} test users`);
    for (let i = 1; i <= USERS; i++) {
      const name = `lt_user_${i}`;
      const email = `${name}@loadtest.invalid`;
      const res = await db.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3) RETURNING id`,
        [name, email, hash],
      );
      const token = await login(email, password);
      users.push({ id: res.rows[0].id, name, token });
      process.stdout.write(".");
    }
    console.log(" done");

    // Contest that is already running
    const now = Date.now();
    const created = await api("/api/contests", {
      method: "POST",
      token: adminToken,
      body: {
        title: "Load Test",
        description: "Created by scripts/loadtest.js",
        starts_at: new Date(now - 60 * 1000).toISOString(),
        ends_at: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
        problem_ids: SLUGS.map((s) => problemIds[s]),
      },
    });
    if (created.status !== 201) {
      throw new Error(
        `could not create the contest: ${created.data && created.data.error}`,
      );
    }
    contestId = created.data.contest.id;

    // Plan: every submission starts at a random moment inside the window
    const jobs = [];
    for (const user of users) {
      for (let k = 0; k < SUBS_PER_USER; k++) {
        jobs.push({
          user,
          delayMs: Math.random() * SPREAD_SECONDS * 1000,
          kind: pickKind(),
          slug: SLUGS[Math.floor(Math.random() * SLUGS.length)],
        });
      }
    }
    console.log(
      `Contest #${contestId}: ${USERS} users x ${SUBS_PER_USER} submissions = ` +
        `${jobs.length} submissions, starting within ${SPREAD_SECONDS}s`,
    );

    const results = [];
    const rejected = [];
    let inFlight = 0;
    let maxInFlight = 0;
    let firstSubmitAt = null;
    let lastVerdictAt = null;
    const runStart = Date.now();

    async function runJob(job) {
      await sleep(job.delayMs);
      const code =
        job.kind === "correct" ? solutions[job.slug] : KINDS[job.kind].code;
      const t0 = Date.now();
      const r = await api("/api/submissions", {
        method: "POST",
        token: job.user.token,
        body: {
          problem_id: problemIds[job.slug],
          contest_id: contestId,
          language: "python",
          code,
        },
      });
      if (r.status !== 201) {
        rejected.push({
          status: r.status,
          error: r.data && r.data.error,
        });
        return;
      }
      if (firstSubmitAt === null) firstSubmitAt = t0;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);

      const status = await waitForVerdict(
        job.user.token,
        r.data.submission.id,
        t0,
      );

      inFlight--;
      lastVerdictAt = Date.now();
      results.push({
        userId: job.user.id,
        slug: job.slug,
        kind: job.kind,
        status,
        latencyMs: lastVerdictAt - t0,
      });
    }

    const progress = setInterval(() => {
      const elapsed = Math.round((Date.now() - runStart) / 1000);
      console.log(
        `  [${elapsed}s] judged ${results.length + rejected.length}/${jobs.length}, in flight ${inFlight}`,
      );
    }, 10000);

    await Promise.all(jobs.map(runJob));
    clearInterval(progress);

    // Give the worker a moment to finish the last leaderboard update
    await sleep(3000);

    // ---------- Report ----------
    console.log("\n=== Results ===");
    console.log(
      `Submissions accepted by the API: ${results.length}   rejected: ${rejected.length}`,
    );
    for (const r of rejected.slice(0, 5)) {
      console.log(`  rejected: ${r.status} ${r.error || ""}`);
    }

    const counts = {};
    for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
    console.log("Verdicts:", JSON.stringify(counts));

    const unexpected = results.filter((r) => r.status !== KINDS[r.kind].expect);
    console.log(`Unexpected verdicts: ${unexpected.length}`);
    for (const r of unexpected.slice(0, 5)) {
      console.log(
        `  ${r.kind} submission to ${r.slug} got ${r.status} (expected ${KINDS[r.kind].expect})`,
      );
    }
    if (unexpected.length > 0) allChecksPassed = false;

    console.log(
      "\nEnd-to-end latency (submit until final verdict, 1s polling):",
    );
    console.log(`  all      ${stats(results.map((r) => r.latencyMs))}`);
    for (const kind of Object.keys(KINDS)) {
      const subset = results.filter((r) => r.kind === kind);
      if (subset.length > 0) {
        console.log(
          `  ${kind.padEnd(8)} ${stats(subset.map((r) => r.latencyMs))}`,
        );
      }
    }

    if (firstSubmitAt !== null && lastVerdictAt !== null) {
      const minutes = (lastVerdictAt - firstSubmitAt) / 60000;
      console.log(
        `\nThroughput: ${results.length} submissions judged in ${(minutes * 60).toFixed(0)}s ` +
          `= ${(results.length / minutes).toFixed(1)} per minute`,
      );
    }
    console.log(`Peak waiting at once: ${maxInFlight} submissions`);

    // ---------- Leaderboard checks ----------
    console.log("\nLeaderboard checks:");
    const lb1 = await api(`/api/contests/${contestId}/leaderboard`, {
      token: adminToken,
    });
    const rebuild = await api(
      `/api/contests/${contestId}/leaderboard/rebuild`,
      {
        method: "POST",
        token: adminToken,
      },
    );
    const lb2 = await api(`/api/contests/${contestId}/leaderboard`, {
      token: adminToken,
    });
    if (lb1.status !== 200 || lb2.status !== 200 || rebuild.status >= 300) {
      console.log("  FAIL: could not read or rebuild the leaderboard");
      allChecksPassed = false;
    } else {
      const live = boardMap(lb1.data);
      const rebuilt = boardMap(lb2.data);

      let same = live.size === rebuilt.size;
      for (const [uid, v] of live) {
        const w = rebuilt.get(uid);
        if (
          !w ||
          w.solved !== v.solved ||
          w.penalty !== v.penalty ||
          w.rank !== v.rank
        ) {
          same = false;
        }
      }
      console.log(
        `  live board equals board rebuilt from Postgres: ${same ? "PASS" : "FAIL"}`,
      );
      if (!same) allChecksPassed = false;

      const expectedSolved = new Map(users.map((u) => [u.id, new Set()]));
      for (const r of results) {
        if (r.status === "Accepted") expectedSolved.get(r.userId).add(r.slug);
      }
      let wrongRows = 0;
      for (const [uid, solvedSet] of expectedSolved) {
        const row = live.get(uid);
        const boardSolved = row ? row.solved : 0;
        if (boardSolved !== solvedSet.size) wrongRows++;
      }
      console.log(
        `  solved counts match what the script saw: ${wrongRows === 0 ? "PASS" : `FAIL (${wrongRows} users differ)`}`,
      );
      if (wrongRows > 0) allChecksPassed = false;
    }

    console.log(
      `\n${allChecksPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`,
    );
  } finally {
    if (KEEP) {
      console.log(
        `\nKEEP=1: left the lt_user_* users and contest #${contestId} in place. The next run removes the users.`,
      );
    } else {
      try {
        if (contestId !== null && adminToken) {
          await api(`/api/contests/${contestId}`, {
            method: "DELETE",
            token: adminToken,
          });
        }
        await db.query(USER_CLEANUP_SQL);
        console.log(
          "\nCleaned up the test users, their submissions and the contest.",
        );
      } catch (err) {
        console.error("Cleanup problem:", err.message);
      }
    }
    await db.end();
  }

  process.exitCode = allChecksPassed ? 0 : 1;
}

main().catch((err) => {
  console.error("Load test crashed:", err.message);
  process.exit(1);
});
