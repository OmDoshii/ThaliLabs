/**
 * Automatic validation applied before a fetched entry is saved publicly.
 * Mirrors section 8 of the spec.
 */

export interface Candidate {
  name: string;
  category: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fetchedProductName?: string;
  /** Set when the page showed per-serving values that we converted. */
  servingGrams?: number;
  sourceCount: number;
}

export interface CheckResult {
  passed: boolean;
  failed: string[];
  /** 'low' = single source, 'normal' = two sources agree. */
  confidence: 'low' | 'normal';
}

/** Category sanity ranges per 100g (protein in grams). Inclusive. */
export const CATEGORY_RANGES: Record<string, { protein?: [number, number]; fat?: [number, number]; kcal?: [number, number] }> = {
  paneer: { protein: [15, 25], fat: [15, 30] },
  whey: { protein: [60, 90] },
  'protein-bar': { protein: [15, 50] },
  curd: { protein: [2, 14], kcal: [40, 140] },
  milk: { protein: [2.5, 5], kcal: [40, 90] },
  eggs: { protein: [11, 14] },
  oats: { protein: [10, 17], kcal: [340, 420] },
  'peanut-butter': { protein: [20, 32], fat: [40, 56] },
  'soya-chunks': { protein: [45, 55], kcal: [300, 360] },
};

export function atwaterKcal(protein: number, carbs: number, fat: number): number {
  return 4 * protein + 4 * carbs + 9 * fat;
}

/** Atwater check: stated kcal within `tolerance` of 4P + 4C + 9F. */
export function atwaterOk(c: { kcal: number; protein: number; carbs: number; fat: number }, tolerance = 0.12): boolean {
  const expected = atwaterKcal(c.protein, c.carbs, c.fat);
  if (expected <= 0) return false;
  return Math.abs(c.kcal - expected) / expected <= tolerance;
}

/** Convert per-serving values to per 100g. */
export function normalizeToPer100g<T extends { kcal: number; protein: number; carbs: number; fat: number }>(
  v: T,
  servingGrams: number,
): T {
  const k = 100 / servingGrams;
  return { ...v, kcal: v.kcal * k, protein: v.protein * k, carbs: v.carbs * k, fat: v.fat * k };
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Fraction of query tokens found in the page product name (tolerates small typos). */
export function nameMatchScore(query: string, productName: string): number {
  const q = tokens(query);
  const p = tokens(productName);
  if (q.length === 0) return 0;
  const hit = q.filter((qt) => p.some((pt) => pt === qt || (qt.length >= 4 && pt.startsWith(qt)) || (pt.length >= 4 && qt.startsWith(pt)) || levenshtein(pt, qt) <= 1));
  return hit.length / q.length;
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

export function runChecks(c: Candidate, query: string): CheckResult {
  const failed: string[] = [];

  if (![c.kcal, c.protein, c.carbs, c.fat].every((n) => Number.isFinite(n) && n >= 0)) {
    failed.push('missing_or_invalid_values');
  } else {
    if (c.protein + c.carbs + c.fat > 100.5) failed.push('macros_exceed_100g');
    if (!atwaterOk(c)) failed.push('atwater_mismatch');

    const range = CATEGORY_RANGES[c.category];
    if (range?.protein && (c.protein < range.protein[0] || c.protein > range.protein[1])) failed.push('protein_out_of_range');
    if (range?.fat && (c.fat < range.fat[0] || c.fat > range.fat[1])) failed.push('fat_out_of_range');
    if (range?.kcal && (c.kcal < range.kcal[0] || c.kcal > range.kcal[1])) failed.push('kcal_out_of_range');
  }

  if (c.fetchedProductName && nameMatchScore(query, c.fetchedProductName) < 0.6) {
    failed.push('product_name_mismatch');
  }

  return { passed: failed.length === 0, failed, confidence: c.sourceCount >= 2 ? 'normal' : 'low' };
}
