import { describe, expect, it } from "vitest";
import { DISTRICTS, normalizeBdPhone, maskPhone } from "./bd";
import { LINES, lineFinished, optotypeMm, randomDirs, scoreAcuity, visionBand, logCS, greyFor } from "./vision";
import { decideReferral, rankHospitals, smsText, whatsappLink, type Hospital } from "./referral";
import { isRedFlag, searchKb } from "./assistant-kb";
import { estimateDistanceCm } from "./capture";

describe("Bangladesh helpers", () => {
  it("has 64 districts in 8 divisions", () => {
    expect(DISTRICTS).toHaveLength(64);
    expect(new Set(DISTRICTS.map((d) => d.division)).size).toBe(8);
  });
  it("normalises mobile numbers, including Bangla digits", () => {
    expect(normalizeBdPhone("01712-345678")).toBe("+8801712345678");
    expect(normalizeBdPhone("+8801812345678")).toBe("+8801812345678");
    expect(normalizeBdPhone("০১৭১২৩৪৫৬৭৮")).toBe("+8801712345678");
    expect(normalizeBdPhone("01212345678")).toBeNull();
    expect(normalizeBdPhone("0171234567")).toBeNull();
    expect(maskPhone("+8801712345678")).toMatch(/5678$/);
  });
});

describe("Tumbling-E acuity", () => {
  it("6/6 optotype is ~2.9 mm at 2 m and 6/60 is 10× larger", () => {
    expect(optotypeMm(0, 2)).toBeCloseTo(2.909, 2);
    expect(optotypeMm(1, 2) / optotypeMm(0, 2)).toBeCloseTo(10, 5);
  });
  it("stops a line once pass or fail is certain", () => {
    expect(lineFinished(3, 3)).toBe(true);
    expect(lineFinished(0, 3)).toBe(true); // 0 + 2 remaining < 3
    expect(lineFinished(1, 2)).toBe(false);
  });
  it("scores the smallest passed line", () => {
    const res = LINES.slice(0, 5).map((l, i) => ({ logmar: l.logmar, correct: i < 4 ? 4 : 1, shown: 5 }));
    expect(scoreAcuity(res)?.snellen).toBe("6/18");
    expect(scoreAcuity([{ logmar: 1, correct: 1, shown: 5 }])).toBeNull();
  });
  it("never repeats a direction twice in a row", () => {
    const d = randomDirs(50);
    for (let i = 1; i < d.length; i++) expect(d[i]).not.toBe(d[i - 1]);
  });
  it("uses WHO cut-offs", () => {
    expect(visionBand(0.3, true)).toBe("normal");
    expect(visionBand(0.48, true)).toBe("mild");
    expect(visionBand(0.6, true)).toBe("moderate_or_worse");
    expect(visionBand(null, true)).toBe("moderate_or_worse");
    expect(visionBand(null, false)).toBe("unknown");
  });
  it("contrast helpers", () => {
    expect(logCS(1)).toBe(2);
    expect(logCS(null)).toBeNull();
    expect(greyFor(100)).toBe(0);
    expect(greyFor(50)).toBe(128);
  });
});

describe("Referral triage", () => {
  const eye = (o: Partial<Parameters<typeof decideReferral>[0][number]>) => ({ eye: "left" as const, aiPositive: false, logmar: 0, visionTested: true, pinholeImproves: null, ...o });
  it("AI positive → urgent cataract", () => {
    expect(decideReferral([eye({ aiPositive: true })])).toMatchObject({ refer: true, type: "cataract", priority: "urgent", reason: "ai_suspected" });
  });
  it("low vision improving with pinhole → spectacles", () => {
    expect(decideReferral([eye({ logmar: 0.8, pinholeImproves: true })])).toMatchObject({ type: "spectacles", priority: "routine" });
  });
  it("low vision not improving → other, urgent", () => {
    expect(decideReferral([eye({ logmar: null, pinholeImproves: false })])).toMatchObject({ type: "other", priority: "urgent" });
  });
  it("uses the better eye", () => {
    expect(decideReferral([eye({ logmar: 1 }), eye({ eye: "right", logmar: 0 })]).refer).toBe(false);
  });
  it("no data → no referral", () => {
    expect(decideReferral([eye({ visionTested: false, aiPositive: null })]).refer).toBe(false);
  });
});

describe("Hospital ranking and messages", () => {
  const h = (o: Partial<Hospital>): Hospital => ({ id: Math.random().toString(), name_en: "H", name_bn: "হ", district: "Dhaka", division: "Dhaka", address_en: null, address_bn: null, phone: null, services: ["cataract_surgery"], cost_note_bn: null, verified: false, active: true, ...o });
  it("prefers same district, then division, then national; keeps local hospital as last resort", () => {
    const list = [h({ id: "dhaka" }), h({ id: "ctg", district: "Chattogram", division: "Chattogram" }), h({ id: "local", district: "Khagrachari", division: "Chattogram", services: ["eye_opd"] })];
    expect(rankHospitals(list, "Khagrachari", "cataract").map((x) => x.id)).toEqual(["ctg", "dhaka", "local"]);
  });
  it("SMS has study id and no name", () => {
    const t = smsText({ studyId: "NETRA-0007", type: "cataract", hospital: null });
    expect(t).toContain("NETRA-0007");
    expect(whatsappLink("+8801712345678", t)).toMatch(/^https:\/\/wa\.me\/8801712345678\?text=/);
  });
});

describe("Assistant knowledge base", () => {
  it("flags emergencies", () => {
    expect(isRedFlag("চোখে হঠাৎ দেখতে পাচ্ছে না")).toBe(true);
    expect(isRedFlag("ছবি কিভাবে তুলব")).toBe(false);
  });
  it("finds photo guidance offline", () => {
    expect(searchKb("ছবি তোলা ঝাপসা হচ্ছে কেন")?.entry.id).toBe("photo-how");
    expect(searchKb("xyz")).toBeNull();
  });
});

describe("Iris distance estimate", () => {
  it("guide-sized iris is ~7 cm away; smaller iris means farther", () => {
    const near = estimateDistanceCm(0.09)!, far = estimateDistanceCm(0.045)!;
    expect(near).toBeGreaterThan(5); expect(near).toBeLessThan(10);
    expect(far).toBeCloseTo(near * 2, -1);
    expect(estimateDistanceCm(null)).toBeNull();
  });
});
