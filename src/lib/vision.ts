/**
 * Visual acuity with a Tumbling-E chart (Peek-Acuity style: a health worker holds the phone,
 * the patient points in the direction of the E, the worker taps that direction).
 * Optotype height = 5 arc-minutes × 10^logMAR at the test distance.
 */
export type Dir = "up" | "down" | "left" | "right";
export const DIRS: Dir[] = ["up", "right", "down", "left"];

export type AcuityLine = { logmar: number; snellen: string };
/** Lines used by most Bangladeshi eye clinics (6 m Snellen notation). */
export const LINES: AcuityLine[] = [
  { logmar: 1.0, snellen: "6/60" },
  { logmar: 0.8, snellen: "6/36" },
  { logmar: 0.6, snellen: "6/24" },
  { logmar: 0.48, snellen: "6/18" },
  { logmar: 0.3, snellen: "6/12" },
  { logmar: 0.18, snellen: "6/9" },
  { logmar: 0.0, snellen: "6/6" },
];
export const OPTOTYPES_PER_LINE = 5;
export const PASS_MARK = 3; // ≥3 of 5 correct = line passed

const FIVE_ARCMIN = Math.tan((5 / 60) * (Math.PI / 180));

/** Height of the E in millimetres for a given logMAR at a distance in metres. */
export function optotypeMm(logmar: number, distanceM: number) {
  return distanceM * 1000 * FIVE_ARCMIN * 10 ** logmar;
}

/** Height in CSS pixels, using the per-phone calibration (CSS px per mm). */
export function optotypePx(logmar: number, distanceM: number, pxPerMm: number) {
  return optotypeMm(logmar, distanceM) * pxPerMm;
}

/** A random sequence of directions with no immediate repeats (harder to guess). */
export function randomDirs(n: number, rnd: () => number = Math.random): Dir[] {
  const out: Dir[] = [];
  while (out.length < n) {
    const d = DIRS[Math.floor(rnd() * 4)] as Dir;
    if (out[out.length - 1] !== d) out.push(d);
  }
  return out;
}

export type LineResult = { logmar: number; correct: number; shown: number };

/** Best line passed; null = could not read the largest line (worse than 6/60). */
export function scoreAcuity(results: LineResult[]): AcuityLine | null {
  let best: AcuityLine | null = null;
  for (const line of LINES) {
    const r = results.find((x) => x.logmar === line.logmar);
    if (!r) break;
    if (r.correct >= PASS_MARK) best = line;
    else break;
  }
  return best;
}

/** Stop as soon as a line can no longer be passed, or has been passed. */
export function lineFinished(correct: number, shown: number) {
  const remaining = OPTOTYPES_PER_LINE - shown;
  return correct >= PASS_MARK || correct + remaining < PASS_MARK || shown >= OPTOTYPES_PER_LINE;
}

/** Contrast levels (Weber, %) for the experimental contrast check, largest E only. */
export const CONTRASTS = [100, 50, 25, 12.5, 6.25, 3.13];
export const logCS = (lowestSeenPct: number | null) => (lowestSeenPct == null ? null : Math.round(-Math.log10(lowestSeenPct / 100) * 100) / 100);
/** Grey level (0–255) of a dark E with the given Weber contrast on a white (255) background. */
export const greyFor = (pct: number) => Math.round(255 * (1 - pct / 100));

export type VisionBand = "normal" | "mild" | "moderate_or_worse" | "unknown";
/**
 * WHO categories by presenting acuity of the better eye:
 * 6/12 or better = no/mild impairment for screening; worse than 6/12 = mild (advise check);
 * worse than 6/18 = moderate or worse visual impairment (refer).
 */
export function visionBand(logmar: number | null | undefined, tested: boolean): VisionBand {
  if (!tested) return "unknown";
  if (logmar == null) return "moderate_or_worse";
  if (logmar > 0.48) return "moderate_or_worse";
  if (logmar > 0.3) return "mild";
  return "normal";
}

export const DEFAULT_PX_PER_MM = 96 / 25.4; // CSS reference pixel; real phones differ → calibrate
export const ID_CARD_WIDTH_MM = 85.6; // ISO/IEC 7810 ID-1 (NID smart card, bank card)
