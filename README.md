# Jurybit

A contest judge for college coding clubs: sandboxed code execution, live verdicts, and a real-time leaderboard.

**Live demo:** https://jurybit.askrepo.me (hosted on a small Azure VM that I shut down when idle, so it may be offline. If it is, the setup steps below run it locally.)

I built Jurybit to learn how online judges work: running untrusted code safely, queueing work, pushing verdicts to the browser as they happen, and scoring timed contests. It is a learning project, not a replacement for Codeforces or CodeChef.

## Features

- Submit **Python** or **C++**; each test runs in its own locked-down Docker container.
- **Live verdicts** over WebSockets: Queued, Running, a per-test progress bar, then the final verdict.
- Verdicts: Accepted, Wrong Answer, Time Limit Exceeded, Memory Limit Exceeded, Runtime Error, Compilation Error, Internal Error.
- **Timed contests** with an ICPC-style leaderboard (problems solved, then penalty; 20 minutes per wrong attempt).
- **Admin panel** for problems, test cases and contests.
- JWT auth with user and admin roles, and rate limiting on login, register and submit.

## Architecture

```
Browser (React) ──HTTPS──> Caddy ──> Express API ──> Postgres (source of truth)
     ^                                   │  │
     │                                   │  └──> Redis (leaderboard cache)
     └──── WebSocket (live verdicts) ────┤
                                         v
                                   BullMQ queue (Redis)
                                         │
                                         v
                              Worker ──> Docker sandbox (one container per test)
                                         │
                                         └──> verdict saved to Postgres
```

1. The API saves the submission as `Queued`, adds a BullMQ job and answers immediately.
2. A separate worker process takes the job, compiles C++ once, and runs each test in a fresh container.
3. The worker stops at the first failing test and saves the verdict. For contest submissions it also refreshes the leaderboard.
4. The API listens to the queue's events and pushes progress and the final verdict to the browser over a WebSocket.

**Stack:** React (Vite), Node.js and Express 5, Postgres 16, Redis with BullMQ, Docker, `ws`.

## How the sandbox works

Every test run gets its own container with:

- no network (`--network none`)
- a read-only filesystem, with a small `noexec` tmpfs for `/tmp`
- memory limit with swap disabled, `--cpus 0.5`, `--pids-limit 64`
- all capabilities dropped, `no-new-privileges`, and an unprivileged user
- output caps (1 MB stdout, 64 KB stderr)
- a hard kill timer, with the run time measured from Docker's own start and finish timestamps

The sandbox is tested against a set of attack programs: infinite loops, memory hogs, fork bombs, network calls, file reads and writes, huge output, segfaults, and compiler bombs. Each one must end in the expected verdict, with no leftover containers.

## Performance

Load test: 20 users, 3 submissions each, spread over 60 seconds (60 submissions; 70% correct, 20% wrong answer, 10% infinite loop). The script is in `server/scripts/loadtest.js`. In every run listed below, all verdicts matched expectations unless stated otherwise.

| Environment                                     | Worker concurrency | Throughput     | p50 latency | p95 latency |
| ----------------------------------------------- | ------------------ | -------------- | ----------- | ----------- |
| MacBook (Docker inside a VM)                    | 1                  | 29.1 / min     | 43 s        | 62 s        |
| MacBook (Docker inside a VM)                    | 2                  | 49 to 54 / min | 6 to 8 s    | 11 to 12 s  |
| Azure B2als_v2 (2 vCPU, 4 GiB), Standard SSD    | 2                  | 15.0 / min     | 101 s       | 171 s       |
| Azure B2als_v2 (2 vCPU, 4 GiB), **Premium SSD** | 2                  | **25.3 / min** | 36 s        | 82 s        |

Latency is measured from submit until the final verdict and includes up to 1 s of polling in the test script.

What I learned from these numbers:

- **The first server run was slow because of the disk, not the CPU.** CPU credits stayed high and CPU use was low, but `iostat` showed the 30 GiB Standard SSD pinned at its 500 IOPS limit with about 18 ms write latency. Every test creates and removes a container, which is a lot of small metadata writes.
- Moving to a Premium SSD removed the cap (write latency about 0.75 ms) and raised throughput by about 70%. After that the VM was CPU-bound.
- **More workers is not always faster.** At concurrency 4 on the slow disk, run times stretched, which produced false Time Limit Exceeded and Internal Error verdicts. Sandboxes are limited to 0.5 CPU each, so I keep concurrency at the number of vCPUs.
- A 5 to 10 person contest sends far fewer than 25 submissions a minute. A rush near the end of a contest is the real risk.

## Run it locally

Requirements: Docker, Node.js 22 or newer, Python 3.

1. Start Postgres and Redis:

```bash
docker run -d --name oj-postgres -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=onlinejudge -p 5432:5432 postgres:16
docker run -d --name oj-redis -p 6379:6379 redis:7
```

2. Pull the sandbox images and apply the schema:

```bash
docker pull python:3.12-slim && docker pull gcc:14
docker exec -i oj-postgres psql -U postgres -d onlinejudge < server/src/db/schema.sql
```

3. Create `server/.env`:

```
PORT=3000
DATABASE_URL=postgres://postgres:devpassword@localhost:5432/onlinejudge
REDIS_URL=redis://localhost:6379
JWT_SECRET=pick-a-long-random-string
```

and `worker/.env`:

```
DATABASE_URL=postgres://postgres:devpassword@localhost:5432/onlinejudge
REDIS_URL=redis://localhost:6379
WORKER_CONCURRENCY=2
```

4. Install dependencies and run the three processes, each in its own terminal:

```bash
cd server && npm install && node src/index.js
cd worker && npm install && node index.js
cd client && npm install && npm run dev
```

5. Open http://localhost:5173, register, then make yourself admin:

```bash
docker exec -i oj-postgres psql -U postgres -d onlinejudge -c "UPDATE users SET role='admin' WHERE id=(SELECT min(id) FROM users);"
```

Log out and back in, because the role is stored in the login token.

6. Load the sample problems (the script reads admin credentials from environment variables):

```bash
cd problems
export OJ_ADMIN_EMAIL='you@example.com'
read -s -p "Admin password: " OJ_ADMIN_PASSWORD; export OJ_ADMIN_PASSWORD; echo
python3 seed.py
```

## Project layout

| Folder         | What it holds                                                      |
| -------------- | ------------------------------------------------------------------ |
| `client/`      | React app: problems, contests, leaderboard, admin panel            |
| `server/`      | Express API, auth, WebSocket server, leaderboard, load test script |
| `worker/`      | Queue worker that judges submissions                               |
| `sandbox-lab/` | Docker sandbox runner and the attack programs used to test it      |
| `problems/`    | Reference solutions, test generators and `seed.py`                 |

Test cases come from a reference solution plus a generator for each problem, so the reference solution is the source of truth for expected output.

## Known limitations

- Output is compared exactly (trailing whitespace ignored). There are no custom checkers, so problems with several valid answers are not supported.
- Only Python and C++.
- Memory use is limited but not measured, so the memory column is empty.
- No rejudge button, no pagination, and the leaderboard refreshes by polling every 5 seconds rather than by push.
- Testing so far is manual plus the load test and the sandbox attack set; there are no automated unit tests.
- One load-test run with concurrency 4 on the slow disk failed the check that compares the live leaderboard with one rebuilt from Postgres. It did not repeat at concurrency 2 in any later run, but I have not proven that concurrent finishes for the same user can never write results out of order.
