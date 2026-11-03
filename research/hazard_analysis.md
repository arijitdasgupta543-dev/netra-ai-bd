# S1 Table. Hazard analysis (ISO 14971-style).

Each hazard is linked to its cause, the mechanism that controls it and the test that verifies the mechanism.

| Hazard | Cause | Mechanism | Verification |
|---|---|---|---|
| Missed cataract never noticed | AI false negative | random audit with permanent draw; stratified estimator; low-vision field referral | behavior tests T3–T5, T8; simulation (“Field-sensitivity estimator”) |
| Reference labels biased by AI | doctor sees score or queue order | RLS blinding; blinded grading queue; `reviews.blinded` | behavior tests (blinding, T7) |
| Doctor overload | sensitivity-first threshold | two-tier band; workload model | Table 10; trigger test T1–T2 |
| Wrong threshold applied | stale or modified client | band computed by trigger from model registry | test T1 |
| Screening lost or duplicated | poor network | client identifiers; idempotent writes and uploads; offline queue | fault injection (“Offline synchronization under faults”) |
| Personal data leak | exports, logs, messages | separate contacts table and policy; PII-free audit log and SMS log | behavior tests (privacy) |
| Worker alters clinical decision | API misuse | role-keyed guard trigger | test T6 |
| System failure at scale | per-row policy evaluation; identifier overflow | InitPlan policies; sequence identifiers; server-side queues | load test (Table 9) |
| Model differs after conversion | operator approximation | conversion parity as release gate | Table 5 |
| Bad crop | wrong iris circle | worker confirms circle; contact-sheet audit in pipeline | “Dataset” |
