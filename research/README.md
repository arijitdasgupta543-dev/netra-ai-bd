# Netra AI — research materials for the paper

This folder holds everything needed to check or reproduce the results in
"Netra AI: An offline-first smartphone system for cataract screening and referral—architecture,
on-device deep learning and pre-clinical technical verification".
The application itself (code, database migrations, unit tests, fault-injection test) is in the rest of this repository.

## Data (`data/`)

The eye photographs are **not** redistributed. They come from the public Kaggle "Cataract dataset" (https://www.kaggle.com/datasets/nandanp6/cataract-image-dataset).
The local copy used in the paper held 557 of its 612 images (normal training images 5–9 and 50–99 were missing). Place them as `data/Netra_AI/{train,test}/{cataract,normal}/*.jpg`.

| File | Content |
|---|---|
| `image_manifest.csv` | one row per image: original label and split, iris circle (relative to width/height), circle method, clinician review result, reviewed label, included (1/0). 224 rows; 212 included |
| `circles_v4.json` | final iris circles used to cut the pupil crops |
| `circle_qc_corrections.json` | the 8 circles corrected after the contact-sheet check |
| `label_corrections_v5.json` | the 22 labels changed (10) or excluded (12) after clinician review, second pass |
| `clinician_review_pass1.json`, `clinician_review_pass2.json` | the reviewer's answers in both passes (reviewer name removed) |

## Model pipeline (`ml/`)

| Step | Script |
|---|---|
| Circle proposals and contact sheets | `detect_circles.py`, `detect_v2.py`, `sheets.py`, `sheets_grid.py` |
| Pupil crops / full images to arrays | `train_v3.py` (writes `ml/out/data_{crop,full}.npz`) |
| Apply clinician review | `make_v5.py` (writes `data_{crop,full}_v5.npz`: 212 images, 100 cataract) |
| Cross-validation of four architectures and ablations | `train_cv.py`, `run_cv.sh` |
| Deployable model on the locked split, robustness, TensorFlow Lite | `final_clean.py` |
| TF.js conversion | `convert_clean.py`, `export_tfjs.py` |

## Analysis (`analysis/`)

`analyze.py` produces `results_paper.json` (Tables 3, 4 and 10, Figs 4 and 5). `audit_sim.py`/`sim.py` produce the
Monte Carlo study of the field-sensitivity estimator (Fig 6, Table 8). `growth.py` produces the growth-stage table (Table 12).
`fault_injection.txt` is the output of `src/lib/offline-queue.fault.test.ts`.

## Benchmarks (`benchmarks/`)

`browser/`: headless-Chromium timing of the TF.js model on the CPU and WebAssembly back ends at 1×, 4× and 6× CPU throttling,
and the TF.js parity check (Table 5). `load_test/`: seed script and pgbench queries for the 200,401-patient load test (Table 9).

## Database checks (`database_tests/`)

`reset.sh` applies all migrations to a fresh PostgreSQL 16 database with a shim of the authentication schema and runs the
29 behaviour checks in `behaviour.sql` (Table 7). The migration-level checks are also in `drizzle/tests/`.

## Clinician review page (`clinician_review/`)

The self-contained review page (`template.html`), the image order (`qc_map.json`) and the decoder of the result code
(`decode_result.py`).

Research use only. The model is not validated on patients and must not be used for diagnosis.
