# Database load test (local PostgreSQL 16, 2 vCPU container, RLS on, as `authenticated` users)
Data: 200,401 patients, 400,802 eye photos, ~50,000 referrals (~10 field days at 1,000 workers × 20 patients/day).
Scripts: drizzle/tests/bench/*.sql (pgbench). PostgREST/network latency not included.

| Operation | Before 0007 (avg latency) | After 0007 (avg latency) |
|---|---|---|
| Save one screening (patient, contact, 2 eyes, 2 AI scores + trigger, vision) | 14.9 ms | 12.0 ms |
| Records page (20 rows) | 1.7 ms | 1.2 ms |
| Open-referral queue (50) + urgent count | 4,424 ms | 17.3 ms |
| Old review page query (all confirmed photos) | 5,298 ms | 369 ms |
| New `review_queue(20)` RPC | – | 21.3 ms |
| Dashboard + referral stats | 422 ms | 434 ms |

Screening throughput after 0007: 668 transactions/s (before: 536) with 8 clients (needed at 1,000 workers: ~0.7/s average, ~3.5/s peak).
Also found: the original study-ID default `lpad(n,4)` truncates from 10,000 patients on (NETRA-1000 collision) — fixed in 0006.
