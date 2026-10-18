import type { BiText } from "./i18n";

export type Diagnosis = "normal" | "cataract_early" | "cataract_advanced" | "other" | "ungradable";
export type Category = "normal" | "cataract" | "other" | "ungradable";

export const DIAGNOSES: Diagnosis[] = ["normal", "cataract_early", "cataract_advanced", "other", "ungradable"];

export const diagnosisLabel: Record<Diagnosis, BiText> = {
  normal: { en: "Normal", bn: "স্বাভাবিক" },
  cataract_early: { en: "Cataract – early (immature)", bn: "ছানি – প্রাথমিক (অপরিপক্ব)" },
  cataract_advanced: { en: "Cataract – advanced (mature)", bn: "ছানি – অগ্রসর (পরিপক্ব)" },
  other: { en: "Other eye disease", bn: "অন্য চোখের রোগ" },
  ungradable: { en: "Ungradable photo", bn: "ছবি মূল্যায়নযোগ্য নয়" },
};

export const sexLabel: Record<string, BiText> = {
  male: { en: "Male", bn: "পুরুষ" },
  female: { en: "Female", bn: "মহিলা" },
  other: { en: "Other", bn: "অন্যান্য" },
};

export const eyeLabel: Record<string, BiText> = {
  left: { en: "Left eye", bn: "বাম চোখ" },
  right: { en: "Right eye", bn: "ডান চোখ" },
};

export const qualityLabel: Record<string, BiText> = {
  good: { en: "Good", bn: "ভালো" },
  fair: { en: "Fair", bn: "মোটামুটি" },
  poor: { en: "Poor", bn: "খারাপ" },
};

export function categoryOf(d: Diagnosis): Category {
  if (d === "cataract_early" || d === "cataract_advanced") return "cataract";
  return d;
}

/** Strict majority-of-votes winner (most votes, no tie). Returns null when empty or tied. */
export function majority<T extends string>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0]?.[1] === sorted[1]?.[1]) return null;
  return sorted[0]?.[0] ?? null;
}

/** Folder name used in the training ZIP. */
export function folderFor(diagnoses: Diagnosis[]): Category | "unlabelled" {
  return majority(diagnoses.map(categoryOf)) ?? "unlabelled";
}

export function ageGroup(age: number | null): string {
  if (age == null) return "?";
  if (age < 18) return "0–17";
  if (age < 40) return "18–39";
  if (age < 60) return "40–59";
  if (age < 75) return "60–74";
  return "75+";
}

export function guessPhoneModel(ua: string): string {
  const m = ua.match(/Android [\d.]+;\s*([^;)]+?)(?:\s+Build|\))/);
  if (m?.[1]) {
    const model = m[1].trim().replace(/^(?:[a-z]{2}[-_][A-Z]{2};\s*)/, '');
    if (model !== 'K' && model !== 'Generic') return model;
  }
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone/.test(ua)) return "iPhone";
  return "Unknown";
}

export async function detectPhoneModel(browser: { userAgent: string; userAgentData?: { getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }> } }): Promise<string> {
  try {
    const data = await browser.userAgentData?.getHighEntropyValues?.(['model']);
    const model = data?.model?.trim();
    if (model && model !== 'K' && model !== 'Generic') return model;
  } catch { /* high-entropy hints may be denied */ }
  return guessPhoneModel(browser.userAgent);
}
