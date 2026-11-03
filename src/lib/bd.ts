import type { BiText } from "./i18n";

/** The 64 districts of Bangladesh, grouped by division (English spelling as used by the BBS). */
export type District = { en: string; bn: string; division: string };

const D = (division: string, rows: [string, string][]): District[] => rows.map(([en, bn]) => ({ en, bn, division }));

export const DISTRICTS: District[] = [
  ...D("Barishal", [["Barguna", "বরগুনা"], ["Barishal", "বরিশাল"], ["Bhola", "ভোলা"], ["Jhalokati", "ঝালকাঠি"], ["Patuakhali", "পটুয়াখালী"], ["Pirojpur", "পিরোজপুর"]]),
  ...D("Chattogram", [["Bandarban", "বান্দরবান"], ["Brahmanbaria", "ব্রাহ্মণবাড়িয়া"], ["Chandpur", "চাঁদপুর"], ["Chattogram", "চট্টগ্রাম"], ["Cumilla", "কুমিল্লা"], ["Cox's Bazar", "কক্সবাজার"], ["Feni", "ফেনী"], ["Khagrachari", "খাগড়াছড়ি"], ["Lakshmipur", "লক্ষ্মীপুর"], ["Noakhali", "নোয়াখালী"], ["Rangamati", "রাঙ্গামাটি"]]),
  ...D("Dhaka", [["Dhaka", "ঢাকা"], ["Faridpur", "ফরিদপুর"], ["Gazipur", "গাজীপুর"], ["Gopalganj", "গোপালগঞ্জ"], ["Kishoreganj", "কিশোরগঞ্জ"], ["Madaripur", "মাদারীপুর"], ["Manikganj", "মানিকগঞ্জ"], ["Munshiganj", "মুন্সীগঞ্জ"], ["Narayanganj", "নারায়ণগঞ্জ"], ["Narsingdi", "নরসিংদী"], ["Rajbari", "রাজবাড়ী"], ["Shariatpur", "শরীয়তপুর"], ["Tangail", "টাঙ্গাইল"]]),
  ...D("Khulna", [["Bagerhat", "বাগেরহাট"], ["Chuadanga", "চুয়াডাঙ্গা"], ["Jashore", "যশোর"], ["Jhenaidah", "ঝিনাইদহ"], ["Khulna", "খুলনা"], ["Kushtia", "কুষ্টিয়া"], ["Magura", "মাগুরা"], ["Meherpur", "মেহেরপুর"], ["Narail", "নড়াইল"], ["Satkhira", "সাতক্ষীরা"]]),
  ...D("Mymensingh", [["Jamalpur", "জামালপুর"], ["Mymensingh", "ময়মনসিংহ"], ["Netrokona", "নেত্রকোণা"], ["Sherpur", "শেরপুর"]]),
  ...D("Rajshahi", [["Bogura", "বগুড়া"], ["Chapai Nawabganj", "চাঁপাইনবাবগঞ্জ"], ["Joypurhat", "জয়পুরহাট"], ["Naogaon", "নওগাঁ"], ["Natore", "নাটোর"], ["Pabna", "পাবনা"], ["Rajshahi", "রাজশাহী"], ["Sirajganj", "সিরাজগঞ্জ"]]),
  ...D("Rangpur", [["Dinajpur", "দিনাজপুর"], ["Gaibandha", "গাইবান্ধা"], ["Kurigram", "কুড়িগ্রাম"], ["Lalmonirhat", "লালমনিরহাট"], ["Nilphamari", "নীলফামারী"], ["Panchagarh", "পঞ্চগড়"], ["Rangpur", "রংপুর"], ["Thakurgaon", "ঠাকুরগাঁও"]]),
  ...D("Sylhet", [["Habiganj", "হবিগঞ্জ"], ["Moulvibazar", "মৌলভীবাজার"], ["Sunamganj", "সুনামগঞ্জ"], ["Sylhet", "সিলেট"]]),
];

export const districtByName = (en: string | null | undefined) => DISTRICTS.find((d) => d.en === en) ?? null;
export const districtLabel = (en: string | null | undefined): BiText => {
  const d = districtByName(en);
  return d ? { en: d.en, bn: d.bn } : { en: en ?? "–", bn: en ?? "–" };
};

/**
 * Normalises a Bangladeshi mobile number to +8801XXXXXXXXX.
 * Accepts 01XXXXXXXXX, 8801XXXXXXXXX, +8801XXXXXXXXX, with spaces/dashes and Bangla digits.
 * Returns null when it is not a valid BD mobile number (operator prefix 013–019).
 */
export function normalizeBdPhone(input: string): string | null {
  const ascii = input.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6)).replace(/[\s\-()]/g, "");
  const m = ascii.match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  return m ? `+88${m[1]}` : null;
}

/** For logs and UI lists: only the last 4 digits. */
export const maskPhone = (p: string | null | undefined) => (p ? `•••••••${p.slice(-4)}` : "–");
