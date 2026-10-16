import type { PatientRow } from "./data";
import { categoryOf, folderFor, majority } from "./labels";

const esc = (v: unknown) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per eye photo; review columns repeat for each doctor (review1_*, review2_*, …). */
export function buildCsv(patients: PatientRow[], doctorNames: Record<string, string>): string {
  const eyes = patients.flatMap((p) => p.eye_images.map((e) => ({ p, e })));
  const maxReviews = Math.max(0, ...eyes.map(({ e }) => e.reviews.length));
  const base = [
    "study_id", "eye", "age", "sex", "site", "date", "phone_model", "flash", "lighting",
    "circle_cx", "circle_cy", "circle_r", "blur_score", "brightness", "glare_fraction", "quality_status",
    "visual_acuity", "image_file", "n_reviews", "consensus_diagnosis", "consensus_category",
  ];
  const rev: string[] = [];
  for (let i = 1; i <= maxReviews; i++)
    rev.push(`review${i}_doctor`, `review${i}_diagnosis`, `review${i}_other`, `review${i}_confidence`, `review${i}_referral`, `review${i}_at`);
  const lines = [[...base, ...rev].join(",")];
  for (const { p, e } of eyes) {
    const reviews = [...e.reviews].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const diags = reviews.map((r) => r.diagnosis);
    const row: unknown[] = [
      p.study_id, e.eye, p.age, p.sex, p.sites?.name, p.screening_date, e.phone_model, e.flash_used, e.lighting,
      e.circle_cx, e.circle_cy, e.circle_r, e.blur_score, e.brightness, e.glare_fraction, e.quality_status,
      e.visual_acuity, `${folderFor(diags)}/${p.study_id}_${e.eye}.jpg`, reviews.length,
      majority(diags), diags.length ? majority(diags.map(categoryOf)) : null,
    ];
    for (let i = 0; i < maxReviews; i++) {
      const r = reviews[i];
      row.push(r ? doctorNames[r.doctor_id] ?? r.doctor_id : "", r?.diagnosis, r?.other_text, r?.confidence, r?.referral, r?.created_at);
    }
    lines.push(row.map(esc).join(","));
  }
  return lines.join("\n");
}
