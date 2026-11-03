/**
 * Offline knowledge base for the health-worker assistant (works without internet).
 * Content: how to use Netra AI, photo technique, basic eye-care facts and next steps.
 * It never diagnoses. Red-flag questions always get the "go to hospital today" answer first.
 */
export type KbEntry = { id: string; keys: string[]; bn: string; en: string };

export const RED_FLAGS = ["হঠাৎ", "ব্যথা", "আঘাত", "রাসায়নিক", "চুন", "কেমিক্যাল", "রক্ত", "লাল", "পুঁজ", "কালো পর্দা", "আলোর ঝলক", "sudden", "pain", "injury", "chemical", "blood", "red eye", "flash", "curtain"];

export const RED_FLAG_ANSWER = {
  bn: "⚠️ এটা জরুরি হতে পারে। হঠাৎ দৃষ্টি কমে যাওয়া, চোখে তীব্র ব্যথা, আঘাত, চোখ খুব লাল হওয়া, বা চোখে চুন/রাসায়নিক পড়লে আজই নিকটস্থ হাসপাতালের চক্ষু বিভাগে পাঠান। রাসায়নিক পড়লে যাওয়ার আগে পরিষ্কার পানি দিয়ে অন্তত ১৫ মিনিট চোখ ধুয়ে দিন। চোখ ঘষবেন না, নিজে থেকে কোনো ড্রপ দেবেন না।",
  en: "⚠️ This may be an emergency. Sudden vision loss, severe pain, injury, a very red eye, or lime/chemical in the eye: send the patient to the nearest hospital eye department today. For chemicals, rinse with clean water for at least 15 minutes before travelling. Do not rub the eye or give drops yourself.",
};

export const KB: KbEntry[] = [
  { id: "what-cataract", keys: ["ছানি কি", "ছানি কী", "cataract", "ছানি কেন", "লেন্স ঘোলা"],
    bn: "ছানি হলো চোখের ভেতরের স্বচ্ছ লেন্স ধীরে ধীরে ঘোলা হয়ে যাওয়া। সাধারণত বয়স বাড়লে হয়; ডায়াবেটিস, ধূমপান ও রোদ ঝুঁকি বাড়ায়। দৃষ্টি ঝাপসা, রং ফ্যাকাশে, রাতে আলোর চারপাশে ঝলক দেখা যায়। ওষুধে সারে না, ছোট একটি অপারেশনে নতুন লেন্স বসালে সাধারণত দৃষ্টি ফিরে আসে।",
    en: "A cataract is clouding of the eye's natural lens, usually with age; diabetes, smoking and sunlight increase risk. Vision becomes blurred, colours fade and lights glare at night. Drops do not cure it; a short operation with a new lens usually restores sight." },
  { id: "surgery-safe", keys: ["অপারেশন", "সার্জারি", "ভয়", "surgery", "operation", "খরচ", "টাকা"],
    bn: "ছানি অপারেশন বিশ্বের সবচেয়ে বেশি করা ও নিরাপদ অপারেশনগুলোর একটি; সাধারণত ২০–৩০ মিনিট লাগে এবং অনেক ক্ষেত্রে একই দিনে বাড়ি ফেরা যায়। সরকারি হাসপাতাল ও অনেক এনজিও চক্ষু শিবিরে কম খরচে বা বিনা খরচে হয়। খরচ ও তারিখ হাসপাতালের সাথে কথা বলে নিশ্চিত করুন।",
    en: "Cataract surgery is one of the most common and safe operations; it usually takes 20–30 minutes and often the patient goes home the same day. Government hospitals and many NGO eye camps offer it at low or no cost. Confirm cost and dates with the hospital." },
  { id: "photo-how", keys: ["ছবি", "ছবি তোলা", "photo", "picture", "ক্যামেরা", "camera", "ঝাপসা ছবি", "blur"],
    bn: "ভালো ছবির নিয়ম: (১) ছায়াযুক্ত ঘরে বা ছায়ায় তুলুন, সরাসরি রোদে নয়। (২) রোগীকে সোজা ক্যামেরার দিকে তাকাতে বলুন, চোখ বড় করে খুলতে বলুন। (৩) ফোন চোখ থেকে প্রায় ১০–১৫ সেমি দূরে রাখুন; মণি মাঝের ঘরে আনুন। (৪) ফ্ল্যাশ বা টর্চের ঝলক মণির ওপর পড়লে একটু কোণ বদলান। (৫) অ্যাপ \"প্রস্তুত\" বললে ট্যাপ করুন এবং ফোন স্থির রাখুন।",
    en: "Good photo rules: (1) shaded room or shade, not direct sun; (2) patient looks straight, eyes wide open; (3) phone ~10–15 cm from the eye, pupil in the centre box; (4) if flash/torch glare is on the pupil, change the angle; (5) tap when the app says Ready and hold still." },
  { id: "circle", keys: ["বৃত্ত", "circle", "মণি", "pupil", "auto", "manual"],
    bn: "ছবি তোলার পর মণির চারপাশে বৃত্তটি ঠিক জায়গায় আছে কি না দেখুন। দরকার হলে টেনে সরান বা স্লাইডার দিয়ে ছোট/বড় করুন, তারপর \"বৃত্ত ঠিক আছে\" চাপুন। AI শুধু বৃত্তের ভেতরের অংশ দেখে, তাই বৃত্ত ঠিক না হলে ফল ভুল হতে পারে।",
    en: "After the photo, check the circle sits on the pupil. Drag or resize it, then press \"Circle is correct\". The AI only looks inside the circle, so a wrong circle gives a wrong result." },
  { id: "vision-test", keys: ["দৃষ্টি পরীক্ষা", "ই চার্ট", "e chart", "tumbling", "acuity", "চার্ট", "দূরত্ব"],
    bn: "দৃষ্টি পরীক্ষা: প্রথমবার ফোনটি একটি NID বা ব্যাংক কার্ডের সাথে মিলিয়ে ক্যালিব্রেট করুন। রোগীকে ২ মিটার (প্রায় ৩ বড় পা) দূরে বসান, এক চোখ হাত দিয়ে ঢাকতে বলুন। স্ক্রিনে \"E\" যেদিকে খোলা, রোগী আঙুল দিয়ে সেদিক দেখাবেন; আপনি সেই তীর চাপবেন। চশমা থাকলে চশমা পরে পরীক্ষা করুন।",
    en: "Vision test: first calibrate the phone against an NID or bank card. Seat the patient 2 m away, cover one eye. The patient points where the E opens; you tap that arrow. Test with the patient's glasses if they have them." },
  { id: "pinhole", keys: ["পিনহোল", "pinhole", "ছিদ্র"],
    bn: "পিনহোল পরীক্ষা: একটি কার্ড বা কাগজে সুঁই দিয়ে ছোট ছিদ্র করুন। দৃষ্টি কম হলে রোগীকে ছিদ্র দিয়ে আবার চার্ট দেখতে বলুন। পিনহোলে ভালো দেখলে সমস্যা সম্ভবত চশমার; ভালো না হলে চক্ষু ডাক্তার দেখানো দরকার।",
    en: "Pinhole test: make a small hole in card with a needle. If vision is low, let the patient read through it. Better with pinhole → likely needs glasses; not better → needs an eye doctor." },
  { id: "result-meaning", keys: ["ফলাফল", "result", "স্কোর", "score", "সন্দেহ", "positive", "negative", "AI কি বলছে"],
    bn: "AI-এর ফল রোগ নির্ণয় নয়, শুধু স্ক্রিনিং। \"সন্দেহ\" এলে রোগীকে চক্ষু ডাক্তারের কাছে পাঠানো হয় এবং কেসটি স্বয়ংক্রিয়ভাবে ডাক্তারের তালিকায় যায়। \"লক্ষণ নেই\" এলেও রোগী ঝাপসা দেখলে চোখ পরীক্ষা করাতে বলুন।",
    en: "The AI result is screening, not a diagnosis. \"Suspected\" sends the patient for an eye doctor and the case goes to the doctor's queue automatically. Even with \"no sign\", advise an eye check if the patient sees poorly." },
  { id: "referral-slip", keys: ["স্লিপ", "slip", "sms", "whatsapp", "হাসপাতাল", "hospital", "রেফার", "refer"],
    bn: "রেফারাল পাতায় রোগীর জন্য বাংলা স্লিপ আছে: কোন হাসপাতালে যাবেন, কী সাথে নেবেন, কী করবেন। স্লিপটি দেখাতে, প্রিন্ট করতে, WhatsApp-এ পাঠাতে বা SMS করতে পারেন। পরে রোগী হাসপাতালে গেলেন কি না সেটা অবশ্যই লিখে রাখুন।",
    en: "The referral page has a Bangla slip: which hospital, what to bring, what to do. Show, print, WhatsApp or SMS it. Later, record whether the patient reached the hospital." },
  { id: "consent", keys: ["সম্মতি", "consent", "নাম", "ফোন নম্বর", "গোপনীয়তা", "privacy", "ঠিকানা"],
    bn: "ছবি তোলার আগে রোগীকে সহজ ভাষায় বুঝিয়ে সম্মতি নিন। নাম, ফোন ও ঠিকানা শুধু রেফারাল ও ফলোআপের জন্য রাখা হয়, আলাদা সুরক্ষিত তালিকায় থাকে এবং গবেষণার ডেটা বা AI ট্রেনিংয়ে যায় না। রোগী না চাইলে নাম-ফোন ছাড়াও স্ক্রিনিং করা যায়।",
    en: "Explain and take consent before the photo. Name, phone and address are kept only for referral and follow-up, in a separate protected list, never in research data or AI training. Screening can be done without them if the patient prefers." },
  { id: "offline", keys: ["ইন্টারনেট", "নেট নেই", "offline", "internet", "আপলোড", "upload", "অপেক্ষমাণ"],
    bn: "নেট না থাকলেও স্ক্রিনিং ফোনে জমা থাকে (\"অপেক্ষমাণ\" লেখা দেখাবে)। নেট এলে নিজে থেকেই আপলোড হয়। অ্যাপ থেকে লগ আউট করবেন না যতক্ষণ অপেক্ষমাণ কেস আছে।",
    en: "Without internet, screenings are stored on the phone (shown as \"pending\") and upload automatically later. Do not log out while cases are pending." },
  { id: "diabetes", keys: ["ডায়াবেটিস", "diabetes", "সুগার", "রেটিনা", "retina"],
    bn: "ডায়াবেটিস থাকলে চোখের পেছনের পর্দায় (রেটিনা) ক্ষতি হতে পারে, যা এই অ্যাপ ধরতে পারে না। ডায়াবেটিস রোগীদের বছরে অন্তত একবার চক্ষু ডাক্তারের কাছে রেটিনা পরীক্ষা করাতে বলুন।",
    en: "Diabetes can damage the retina, which this app cannot detect. Advise diabetic patients to have a retina check by an eye doctor at least once a year." },
  { id: "children", keys: ["শিশু", "বাচ্চা", "child", "children", "ট্যারা", "squint"],
    bn: "শিশুর চোখে সাদা দাগ/সাদা মণি, ট্যারা চোখ, বা চোখ খুব কাছে নিয়ে দেখা – এগুলো দেখলে দেরি না করে চক্ষু ডাক্তারের কাছে পাঠান। এই অ্যাপ মূলত বড়দের ছানির জন্য তৈরি।",
    en: "In children, a white pupil, squint, or holding things very close: refer to an eye doctor without delay. This app is designed mainly for adult cataract." },
  { id: "drops", keys: ["ড্রপ", "ওষুধ", "drop", "medicine", "চোখের ওষুধ"],
    bn: "ছানি কোনো ড্রপ বা ওষুধে ভালো হয় না। ডাক্তারের পরামর্শ ছাড়া স্টেরয়েড চোখের ড্রপ দেবেন না – এতে ছানি ও গ্লুকোমা বাড়তে পারে।",
    en: "No drop or medicine cures cataract. Do not give steroid eye drops without a doctor – they can worsen cataract and cause glaucoma." },
  { id: "prevent", keys: ["প্রতিরোধ", "prevent", "রোদ", "চশমা", "sunglass", "ধূমপান"],
    bn: "ঝুঁকি কমাতে: রোদে টুপি বা সানগ্লাস, ধূমপান বন্ধ, ডায়াবেটিস নিয়ন্ত্রণ, এবং ৪০ বছরের পর নিয়মিত চোখ পরীক্ষা।",
    en: "To lower risk: hat or sunglasses in the sun, stop smoking, control diabetes, regular eye checks after 40." },
];

const norm = (s: string) => s.toLowerCase().replace(/[?!।,.]/g, " ").replace(/\s+/g, " ").trim();

export function isRedFlag(q: string) {
  const s = norm(q);
  return RED_FLAGS.some((k) => s.includes(k.toLowerCase()));
}

/** Simple keyword match; returns the best entry and a 0–1 confidence. */
export function searchKb(q: string): { entry: KbEntry; confidence: number } | null {
  const s = norm(q);
  let best: { entry: KbEntry; confidence: number } | null = null;
  for (const e of KB) {
    let hits = 0, longest = 0;
    for (const k of e.keys) if (s.includes(k.toLowerCase())) { hits++; longest = Math.max(longest, k.length); }
    if (!hits) continue;
    const confidence = Math.min(1, 0.45 + 0.2 * hits + Math.min(0.25, longest / 40));
    if (!best || confidence > best.confidence) best = { entry: e, confidence };
  }
  return best;
}

export const ASSISTANT_SYSTEM_PROMPT = `You are "Netra Sahayak", a Bangla-speaking assistant for community health workers using the Netra AI cataract screening app in rural Bangladesh.
Rules:
- Answer in simple Bangla (unless asked in English), at most 6 short sentences or bullet points.
- You help with: using the app, taking good eye photos, the vision test, referral steps, and general eye-health information.
- You never diagnose a patient, never interpret a specific photo, never prescribe medicines or drops, and never contradict a doctor.
- If anything suggests an emergency (sudden vision loss, pain, injury, chemical, very red eye, flashes/curtain), first tell them to send the patient to a hospital eye department today.
- If unsure, say you are not sure and advise asking the supervising doctor.
- Do not ask for or repeat patient names, phone numbers or addresses.`;
