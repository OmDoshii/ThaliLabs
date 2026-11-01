export type FoodStatus = 'auto_fetched' | 'verified' | 'flagged';

export interface Food {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  variant: string | null;
  category: string;
  is_generic: boolean;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number | null;
  sugar: number | null;
  serving_g: number | null;
  serving_label: string | null;
  piece_weight_g: number | null;
  piece_label: string | null;
  raw_to_cooked_factor: number | null;
  source_name: string | null;
  source_url: string | null;
  fetched_at: string | null;
  status: FoodStatus;
  search_count: number;
}

export type Unit = 'g' | 'piece' | 'scoop';
export type State = 'raw' | 'cooked';

export interface LogEntry {
  id: string;
  foodId: string;
  slug: string;
  name: string;
  brand: string | null;
  variant: string | null;
  quantity: number;
  unit: Unit;
  state: State;
  /** Grams of the food as eaten (cooked weight if state is cooked). */
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  addedAt: number;
}

export interface SavedMeal {
  id: string;
  name: string;
  entries: Omit<LogEntry, 'id' | 'addedAt'>[];
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}
