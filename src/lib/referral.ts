import type { BiText } from "./i18n";
import { districtByName } from "./bd";
import { visionBand, type VisionBand } from "./vision";

export type ReferralType = "cataract" | "spectacles" | "other" | "none";
export type Priority = "urgent" | "routine" | "audit";
export type ReferralStatus = "awaiting_doctor" | "confirmed" | "not_needed" | "patient_informed" | "reached" | "not_reached" | "unknown";
export type ReferralReason = "ai_suspected" | "low_vision" | "random_audit" | "doctor" | "worker";

export type EyeFinding = { eye: "left" | "right"; aiPositive: boolean | null; logmar: number | null; visionTested: boolean; pinholeImproves: boolean | null };
export type Decision = { refer: boolean; type: ReferralType; priority: Priority; reason: ReferralReason | null; band: VisionBand };

/**
 * Screening triage used in the field (the doctor can change it later):
 * 1. AI flags either eye → cataract, urgent (also enforced by the database trigger).
 * 2. Acuity worse than 6/18 in the better eye → refer. If a pinhole improves it → spectacles, otherwise other eye disease.
 * 3. Acuity 6/18 (worse than 6/12) → spectacles check, routine.
 * Otherwise no referral (5% of AI-negative patients are still audited by a doctor, chosen by the server).
 */
export function decideReferral(eyes: EyeFinding[]): Decision {
  const tested = eyes.filter((e) => e.visionTested);
  const better = tested.length ? tested.reduce((a, b) => ((a.logmar ?? 9) <= (b.logmar ?? 9) ? a : b)) : null;
  const band = visionBand(better?.logmar ?? null, !!better);
  if (eyes.some((e) => e.aiPositive)) return { refer: true, type: "cataract", priority: "urgent", reason: "ai_suspected", band };
  if (band === "moderate_or_worse") {
    const pinhole = tested.some((e) => e.pinholeImproves === true);
    return { refer: true, type: pinhole ? "spectacles" : "other", priority: pinhole ? "routine" : "urgent", reason: "low_vision", band };
  }
  if (band === "mild") return { refer: true, type: "spectacles", priority: "routine", reason: "low_vision", band };
  return { refer: false, type: "none", priority: "routine", reason: null, band };
}

export type Hospital = {
  id: string; name_en: string; name_bn: string; district: string; division: string | null;
  address_en: string | null; address_bn: string | null; phone: string | null; services: string[];
  cost_note_bn: string | null; verified: boolean; active: boolean;
};

const NEEDS: Record<ReferralType, string[]> = {
  cataract: ["cataract_surgery"],
  spectacles: ["spectacles", "eye_opd"],
  other: ["eye_opd", "cataract_surgery"],
  none: ["eye_opd"],
};

/** Nearest suitable hospitals: same district, then same division, then the national institute. */
export function rankHospitals(hospitals: Hospital[], district: string | null | undefined, type: ReferralType): Hospital[] {
  const div = districtByName(district)?.division ?? null;
  const needs = NEEDS[type];
  const fit = (h: Hospital) => h.active && h.services.some((s) => needs.includes(s));
  const score = (h: Hospital) => (h.district === district ? 0 : div && h.division === div ? 1 : 2) * 10 + (h.verified ? 0 : 1);
  const good = hospitals.filter(fit).sort((a, b) => score(a) - score(b) || a.name_en.localeCompare(b.name_en));
  // district hospital without the service is still the first point of contact in rural areas
  const local = hospitals.filter((h) => h.active && h.district === district && !fit(h));
  return [...good, ...local];
}

export const typeLabel: Record<ReferralType, BiText> = {
  cataract: { en: "Cataract check / surgery", bn: "ছানি পরীক্ষা / অপারেশন" },
  spectacles: { en: "Glasses (eye test)", bn: "চশমা (চোখ পরীক্ষা)" },
  other: { en: "Other eye problem – eye doctor", bn: "অন্য চোখের সমস্যা – চক্ষু ডাক্তার" },
  none: { en: "No referral", bn: "রেফার প্রয়োজন নেই" },
};

export const statusLabel: Record<ReferralStatus, BiText> = {
  awaiting_doctor: { en: "Waiting for doctor", bn: "ডাক্তারের অপেক্ষায়" },
  confirmed: { en: "Doctor confirmed", bn: "ডাক্তার নিশ্চিত করেছেন" },
  not_needed: { en: "Doctor: not needed", bn: "ডাক্তার: প্রয়োজন নেই" },
  patient_informed: { en: "Patient informed", bn: "রোগীকে জানানো হয়েছে" },
  reached: { en: "Reached hospital", bn: "হাসপাতালে গেছেন" },
  not_reached: { en: "Did not go", bn: "যাননি" },
  unknown: { en: "Unknown", bn: "অজানা" },
};

export const reasonLabel: Record<ReferralReason, BiText> = {
  ai_suspected: { en: "AI suspected cataract", bn: "AI ছানি সন্দেহ করেছে" },
  low_vision: { en: "Low vision on test", bn: "দৃষ্টি পরীক্ষায় কম" },
  random_audit: { en: "Random quality check", bn: "এলোমেলো মান যাচাই" },
  doctor: { en: "Doctor", bn: "ডাক্তার" },
  worker: { en: "Health worker", bn: "স্বাস্থ্যকর্মী" },
};

/** What the patient should do – shown on the slip and sent by SMS. Plain, no diagnosis words for "other". */
export const STEPS_BN: Record<ReferralType, string[]> = {
  cataract: [
    "যত তাড়াতাড়ি সম্ভব (২ সপ্তাহের মধ্যে) নিচের হাসপাতালের চক্ষু বিভাগে যান।",
    "এই স্লিপ/SMS এবং স্টাডি আইডি সাথে নিন।",
    "জাতীয় পরিচয়পত্র, আগের চশমা ও ওষুধের তালিকা থাকলে সাথে নিন।",
    "ডায়াবেটিস বা উচ্চ রক্তচাপ থাকলে ডাক্তারকে জানান।",
    "ছানি অপারেশনে সাধারণত দৃষ্টি ফিরে আসে – ভয় পাবেন না।",
  ],
  spectacles: [
    "সুবিধামতো সময়ে (১ মাসের মধ্যে) চোখ পরীক্ষা করিয়ে চশমার পাওয়ার জেনে নিন।",
    "এই স্লিপ/SMS সাথে নিন।",
    "আগের চশমা থাকলে সাথে নিন।",
  ],
  other: [
    "যত তাড়াতাড়ি সম্ভব চক্ষু ডাক্তার দেখান।",
    "হঠাৎ দৃষ্টি কমে গেলে, চোখে ব্যথা বা লাল হলে দেরি না করে আজই হাসপাতালে যান।",
    "এই স্লিপ/SMS এবং ওষুধের তালিকা সাথে নিন।",
  ],
  none: ["বছরে একবার চোখ পরীক্ষা করান।"],
};

export type SlipInput = { studyId: string; type: ReferralType; hospital: Hospital | null; doctorNote?: string | null };

/** Short SMS text (Bangla, ≤ ~3 SMS parts). No name, no diagnosis score. */
export function smsText({ studyId, type, hospital }: SlipInput) {
  const where = hospital ? `${hospital.name_bn}${hospital.phone ? `, ফোন ${hospital.phone}` : ""}` : "নিকটস্থ চক্ষু হাসপাতাল";
  const what = type === "cataract" ? "চোখের ছানি পরীক্ষা" : type === "spectacles" ? "চোখ পরীক্ষা ও চশমা" : "চক্ষু ডাক্তার দেখানো";
  const when = type === "spectacles" ? "১ মাসের মধ্যে" : "২ সপ্তাহের মধ্যে";
  return `নেত্র AI: আপনার ${what} প্রয়োজন। ${when} যান: ${where}। আইডি ${studyId}। এটি রোগ নির্ণয় নয়, স্ক্রিনিং।`;
}

/** WhatsApp share link to the patient's own number (text contains no name). */
export function whatsappLink(phone: string | null, text: string) {
  const n = phone ? phone.replace(/^\+/, "") : "";
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
