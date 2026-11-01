import type { Food, Macros, State, Unit } from './types.ts';

/** nutrient = (grams / 100) x value per 100g */
export function per100(grams: number, valuePer100: number): number {
  return (grams / 100) * valuePer100;
}

/**
 * Convert a user quantity to grams of the food AS EATEN.
 * - piece: pieces x piece_weight_g
 * - scoop: scoops x serving_g from the label
 */
export function toGrams(food: Food, quantity: number, unit: Unit): number {
  if (!Number.isFinite(quantity) || quantity < 0) return 0;
  if (unit === 'piece') return quantity * (food.piece_weight_g ?? 0);
  if (unit === 'scoop') return quantity * (food.serving_g ?? 0);
  return quantity;
}

/**
 * Raw/cooked handling. Per-100g values in the database are for the RAW item.
 * Cooked weight is larger (rice: ~2.5-3x), so the nutrition of X g cooked
 * equals the nutrition of X / factor g raw.
 */
export function rawEquivalentGrams(food: Food, gramsAsEaten: number, state: State): number {
  if (state === 'cooked' && food.raw_to_cooked_factor && food.raw_to_cooked_factor > 0) {
    return gramsAsEaten / food.raw_to_cooked_factor;
  }
  return gramsAsEaten;
}

export function macrosFor(food: Food, quantity: number, unit: Unit, state: State): Macros {
  const eaten = toGrams(food, quantity, unit);
  const raw = rawEquivalentGrams(food, eaten, state);
  return {
    kcal: per100(raw, food.kcal),
    protein: per100(raw, food.protein),
    carbs: per100(raw, food.carbs),
    fat: per100(raw, food.fat),
  };
}

export function sumMacros(items: Macros[]): Macros {
  return items.reduce(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      protein: a.protein + m.protein,
      carbs: a.carbs + m.carbs,
      fat: a.fat + m.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function availableUnits(food: Food): Unit[] {
  const units: Unit[] = ['g'];
  if (food.piece_weight_g) units.push('piece');
  if (food.serving_g && food.serving_label && /scoop/i.test(food.serving_label)) units.push('scoop');
  return units;
}

export function fmt(n: number, digits = 0): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
