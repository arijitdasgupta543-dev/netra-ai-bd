# Netra Ai Bd

Build "Netra AI – Field Data Collector", a mobile-first web app (works well on Android phone browsers) for a cataract-screening research project in rural Bangladesh. It will be shown to eye doctors at a medical centre and used to collect consented, de-identified eye photos plus doctor labels, so that an AI model can be trained later. Bilingual UI: Bangla and English with a language toggle in the header (default Bangla). Clean, calm medical look (white/teal), large touch targets.

AUTH & ROLES (use Lovable Cloud / Supabase):
- Email + password login. Roles: admin, health_worker, doctor. The first user who signs up becomes admin; admin can change other users' roles on a Users page.
- Row-level security: only logged-in users with a role can read data. Photos go to a PRIVATE storage bucket (signed URLs only, never public).

PAGES
1. Home / About (public): short explanation of Netra AI (smartphone cataract screening for underserved communities; screening not diagnosis; suspected cases referred to eye-care professionals), how data is protected, and a "Login" button.
2. New Screening (health_worker, admin) – step-by-step form:
   a. Consent step (required): checkbox "Patient (or guardian) gave informed consent", consent type (verbal / written), optional photo of signed consent form. Cannot continue without consent.
   b. Patient info WITHOUT names or phone numbers: auto Study ID (format NETRA-0001, incrementing), age (years), sex (male/female/other), district/upazila (text), screening site (dropdown managed by admin, default "Medical Centre 1"), date (auto).
   c. Eye photo: for LEFT and RIGHT eye separately (either can be skipped). Use the phone camera (input with capture="environment") or gallery. Record capture settings: flash used (yes/no), lighting (indoor/outdoor/torch), phone model (auto from user agent, editable).
   d. Pupil circle: show the photo and let the user tap the centre of the pupil and drag to set a circle around the pupil/iris (adjustable). Save circle as normalised cx, cy, r (0–1 of image width/height).
   e. Automatic photo quality check (in the browser): blur (variance of Laplacian), too dark / too bright (mean brightness), glare (fraction of near-white saturated pixels inside the circle). Show green/yellow/red with Bangla+English advice ("আবার তুলুন / retake without flash"). Allow saving anyway but store the quality scores.
   f. Optional: visual acuity per eye (free text, e.g., 6/18), notes.
   g. Save. Show a confirmation with Study ID.
3. Doctor Review (doctor, admin): queue of eye photos not yet reviewed by this doctor. Show the photo large (zoom), the pupil circle toggle, age, sex. IMPORTANT: hide any AI result here so the doctor's opinion is independent. Doctor selects: diagnosis = Normal / Cataract – early (immature) / Cataract – advanced (mature) / Other eye disease (text) / Ungradable photo; confidence 1–5; referral recommended yes/no; comments. Multiple doctors can review the same photo (store each review separately with doctor id and timestamp) so we can measure agreement later.
4. Records (all roles): searchable table of screenings with thumbnails, quality status, number of reviews, consensus label. Detail page per Study ID. Admin can delete a record.
5. Dashboard: totals (patients, eye photos, reviewed, unreviewed), label counts, quality pass rate, breakdown by sex and age group, photos per site. Simple charts.
6. Export for training (admin): (a) CSV with one row per eye photo: study_id, eye, age, sex, site, date, phone model, flash, lighting, circle cx/cy/r, quality scores, each doctor's label/confidence/referral, consensus label (majority); (b) ZIP download of images arranged as label/study_id_eye.jpg (folders: normal, cataract, other, ungradable; use consensus label; unreviewed in "unlabelled"), plus a cropped-pupil version (square crop of side 2.5×r around the circle, resized 224×224) in a second folder tree. Include the CSV inside the ZIP.
7. AI Research Demo (all roles): clearly bannered "Research demo – NOT a diagnosis. Model trained on internet images; not yet validated on patients." Upload/take a photo, draw the pupil circle, then run an in-browser TensorFlow.js model (load from /model/model.json in the public folder; I will add the model files later – until then show "Model not installed yet" gracefully). Pre-processing: square crop of side 2.5×r centred on the circle, resize to 224×224 RGB, float32 values 0–255 (no normalisation; the model normalises internally), batch shape [1,224,224,3]. Output: one sigmoid value = probability of cataract. Show it as a bar with three bands: low (<0.30) "no sign detected", middle "uncertain – see doctor", high (≥0.70) "possible cataract – refer". Do not store demo photos.

DATA MODEL (suggested): sites, patients(study_id, age, sex, area, site_id, consent fields, created_by), eye_images(patient_id, eye, storage_path, circle, capture settings, quality scores, acuity, notes), reviews(eye_image_id, doctor_id, diagnosis, other_text, confidence, referral, comments, created_at), profiles(user_id, full_name, role).

Make every label and button bilingual via the toggle. Keep the code simple and well organised.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://netra-ai-bd.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3450904c-29d8-4b3f-b53c-633bc715ab9f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
