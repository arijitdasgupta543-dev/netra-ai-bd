# Real-phone feedback round 2
- [x] Compact 3:4 camera (max 55svh), tap-to-capture (focus+300ms), shutter flash + vibrate, visible capture/back buttons
- [x] Tic-tac-toe 3×3 guide (white 2px + dark outline), teal centre cell + target circle + label; checks/default circle use centre cell; saved as guide_box
- [x] Auto/Manual pupil tabs after capture; auto falls back to manual; manual has drag, slider, +/- buttons, zoom, arrow nudges; circle_method (auto/manual/auto-then-edited) saved + CSV
- [x] Perf: MediaPipe/TFJS lazy-loaded; one shared iris detector; detection on a 240×320 frame every other tick; checks on a 120×160 centre-cell frame; decoded photo cache; route code splitting (existing)
- [x] Installable app: web manifest + icons (no service worker yet)
- [x] Pupil-only 160×160 thumbnails at save; records pagination (20/page) + server search; one batch signed-URL call per page; narrow column selects; single-record detail query
- [x] Dashboard aggregates via dashboard_stats() RPC
- [x] DB indexes on FKs and filter/sort columns (migration 0005)
- [x] Upload: 1600 px JPEG q0.85; retry-safe save with client ids; IndexedDB offline queue with "pending upload" badge and automatic upload when online
- [ ] Service worker caching of MediaPipe/TFJS model files
- [ ] Review queue pagination (currently loads confirmed image ids only)
- [ ] Real-phone verification of autofocus, torch, iris detection, offline queue

# Phase 2–3 (Oct 2026)
- [x] Patient contact (name, mobile, address) in separate protected table, optional, consented
- [x] District picker (64 districts) for hospital matching
- [x] On-device AI score during screening, stored with model version + threshold (`model_runs`, `predictions`)
- [x] Automatic urgent referral when AI flags an eye; 5% random audit of negatives; AI score blinded for doctors until labelled
- [x] Doctor SMS alert (opt-in) + in-app urgent badge; referral list with doctor decision (type, hospital, advice)
- [x] Bangla referral slip: hospital, steps, print / share / WhatsApp / SMS; follow-up (reached / not reached)
- [x] Tumbling-E vision test with card calibration, pinhole, experimental contrast; WHO cut-offs drive referral type
- [x] Iris-size distance estimate in the camera
- [x] Patient education screen (cataract vision simulation, after-surgery view)
- [x] Health-worker assistant (offline KB + optional online AI, red-flag safety rule)
- [x] Hospitals and model versions managed by admin; referral metrics on the dashboard; audit log
- [ ] Configure SMS gateway secrets (SMS_API_URL, SMS_API_KEY, SMS_SENDER_ID) and confirm provider parameters
- [ ] Verify hospital phones/services by calling; add local NGO eye hospitals and camps
- [ ] Register v3 model in Settings with its validation threshold
- [ ] Real-phone test of the vision test calibration and E sizes
