/**
 * Seed data.
 *
 * GENERICS: approximate per-100g values in the style of IFCT 2017 / standard
 * composition tables. Treat them as a starting point and check each against the
 * IFCT tables before launch, then mark verified in /admin.
 *
 * SAMPLES: branded rows used ONLY for local development when Supabase is not
 * configured, so the brand UI can be seen. They are NOT real label data and are
 * flagged with status "flagged" and an explicit source_name. Do not ship them.
 */
import type { Food } from '../lib/types.ts';

export const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

type Opts = Partial<Pick<Food,
  'serving_g' | 'serving_label' | 'piece_weight_g' | 'piece_label' | 'raw_to_cooked_factor' | 'fibre' | 'sugar' | 'variant'>> & {
  aliases?: string[];
};

export interface SeedFood extends Food { aliases: string[] }

function make(
  name: string, brand: string | null, category: string,
  kcal: number, protein: number, carbs: number, fat: number,
  o: Opts = {}, meta: Partial<Food> = {},
): SeedFood {
  const slug = slugify([brand, name, o.variant].filter(Boolean).join(' '));
  return {
    id: slug, slug, name, brand, variant: o.variant ?? null, category, is_generic: brand === null,
    kcal, protein, carbs, fat, fibre: o.fibre ?? null, sugar: o.sugar ?? null,
    serving_g: o.serving_g ?? null, serving_label: o.serving_label ?? null,
    piece_weight_g: o.piece_weight_g ?? null, piece_label: o.piece_label ?? null,
    raw_to_cooked_factor: o.raw_to_cooked_factor ?? null,
    source_name: 'IFCT 2017 / standard tables (approximate, pending verification)',
    source_url: null, fetched_at: null, status: 'auto_fetched', search_count: 0,
    aliases: o.aliases ?? [], ...meta,
  };
}

const G = (name: string, category: string, k: number, p: number, c: number, f: number, o?: Opts) =>
  make(name, null, category, k, p, c, f, o);

export const GENERICS: SeedFood[] = [
  // vegetables
  G('Tomato', 'vegetables', 18, 0.9, 3.9, 0.2, { aliases: ['tamatar', 'tamatr', 'tamater', 'tomatoes'], piece_weight_g: 100, piece_label: 'medium tomato' }),
  G('Onion', 'vegetables', 40, 1.1, 9.3, 0.1, { aliases: ['pyaz', 'pyaaz', 'kanda', 'onions'], piece_weight_g: 110, piece_label: 'medium onion' }),
  G('Potato', 'vegetables', 77, 2, 17, 0.1, { aliases: ['aloo', 'alu', 'batata', 'potatoes'], piece_weight_g: 120, piece_label: 'medium potato' }),
  G('Spinach', 'vegetables', 23, 2.9, 3.6, 0.4, { aliases: ['palak', 'paalak'] }),
  G('Cauliflower', 'vegetables', 25, 1.9, 5, 0.3, { aliases: ['gobi', 'phool gobi', 'gobhi', 'phoolgobi'] }),
  G('Cabbage', 'vegetables', 25, 1.3, 5.8, 0.1, { aliases: ['patta gobi', 'band gobi', 'pattagobhi'] }),
  G('Carrot', 'vegetables', 41, 0.9, 9.6, 0.2, { aliases: ['gajar', 'gaajar'], piece_weight_g: 70, piece_label: 'medium carrot' }),
  G('Cucumber', 'vegetables', 15, 0.7, 3.6, 0.1, { aliases: ['kheera', 'kakdi', 'kakri'] }),
  G('Okra', 'vegetables', 33, 1.9, 7.5, 0.2, { aliases: ['bhindi', 'lady finger', 'ladyfinger'] }),
  G('Brinjal', 'vegetables', 25, 1, 5.9, 0.2, { aliases: ['baingan', 'eggplant', 'aubergine', 'brinjal'] }),
  G('Green Peas', 'vegetables', 81, 5.4, 14.5, 0.4, { aliases: ['matar', 'mutter', 'peas'] }),
  G('Bottle Gourd', 'vegetables', 14, 0.6, 3.4, 0.1, { aliases: ['lauki', 'dudhi', 'ghiya'] }),
  G('Capsicum', 'vegetables', 22, 0.9, 4.6, 0.2, { aliases: ['shimla mirch', 'bell pepper'] }),
  G('Mushroom', 'vegetables', 25, 3.1, 3.3, 0.3, { aliases: ['khumb', 'mushrooms'] }),
  G('Sweet Potato', 'vegetables', 86, 1.6, 20, 0.1, { aliases: ['shakarkandi', 'shakarkand'] }),
  // fruits
  G('Banana', 'fruits', 89, 1.1, 22.8, 0.3, { aliases: ['kela', 'kele'], piece_weight_g: 100, piece_label: 'medium banana (peeled)' }),
  G('Apple', 'fruits', 52, 0.3, 13.8, 0.2, { aliases: ['seb', 'saib'], piece_weight_g: 150, piece_label: 'medium apple' }),
  G('Mango', 'fruits', 60, 0.8, 15, 0.4, { aliases: ['aam'] }),
  G('Papaya', 'fruits', 43, 0.5, 11, 0.3, { aliases: ['papita'] }),
  G('Orange', 'fruits', 47, 0.9, 11.8, 0.1, { aliases: ['santra', 'narangi'], piece_weight_g: 130, piece_label: 'medium orange' }),
  G('Guava', 'fruits', 68, 2.6, 14.3, 1, { aliases: ['amrud', 'peru'] }),
  G('Watermelon', 'fruits', 30, 0.6, 7.6, 0.2, { aliases: ['tarbooz', 'tarbuj'] }),
  // eggs, meat, fish
  G('Egg (whole)', 'eggs', 143, 12.6, 0.7, 9.5, { aliases: ['anda', 'ande', 'egg', 'eggs'], piece_weight_g: 50, piece_label: 'egg' }),
  G('Egg White', 'eggs', 52, 10.9, 0.7, 0.2, { aliases: ['anda safed', 'egg whites'], piece_weight_g: 33, piece_label: 'egg white' }),
  G('Chicken Breast', 'chicken', 120, 22.5, 0, 2.6, { aliases: ['chicken', 'murga', 'murgi', 'chicken breast boneless'], raw_to_cooked_factor: 0.75 }),
  G('Rohu Fish', 'fish', 97, 16.6, 0, 3, { aliases: ['rohu', 'machli', 'fish', 'machhi'] }),
  // grains & flours
  G('Rice (white, raw)', 'rice', 345, 6.8, 78.2, 0.5, { aliases: ['chawal', 'rice', 'safed chawal'], raw_to_cooked_factor: 2.8 }),
  G('Wheat Atta', 'atta', 341, 12.1, 69.4, 1.7, { aliases: ['atta', 'gehu ka atta', 'wheat flour', 'aata', 'chapati flour'] }),
  G('Rolled Oats', 'oats', 380, 13.5, 67, 6.5, { aliases: ['oats', 'oat', 'jai', 'porridge oats'], raw_to_cooked_factor: 2.5 }),
  G('Poha (rice flakes)', 'grains', 345, 6.6, 77, 1.2, { aliases: ['poha', 'pohe', 'chiwda', 'flattened rice'] }),
  G('Rava (Sooji)', 'grains', 345, 10.4, 74, 0.8, { aliases: ['sooji', 'suji', 'semolina', 'rava'] }),
  G('Besan (Gram Flour)', 'atta', 372, 22.4, 58.8, 5, { aliases: ['besan', 'chickpea flour', 'gram flour'] }),
  G('Bread (white)', 'bread', 265, 9, 49, 3.2, { aliases: ['bread', 'white bread', 'pav'], piece_weight_g: 30, piece_label: 'slice' }),
  G('Makhana', 'snacks', 347, 9.7, 77, 0.1, { aliases: ['makhana', 'fox nuts', 'lotus seeds', 'phool makhana'] }),
  // pulses
  G('Toor Dal', 'dal', 335, 22, 57, 1.5, { aliases: ['toor', 'tur dal', 'arhar dal', 'arhar', 'pigeon pea'], raw_to_cooked_factor: 2.5 }),
  G('Moong Dal', 'dal', 344, 24, 59, 1.2, { aliases: ['moong', 'mung dal', 'green gram'], raw_to_cooked_factor: 2.5 }),
  G('Chana Dal', 'dal', 364, 20.5, 59, 5.3, { aliases: ['chana', 'bengal gram'], raw_to_cooked_factor: 2.5 }),
  G('Masoor Dal', 'dal', 343, 25, 59, 0.7, { aliases: ['masoor', 'red lentil', 'lal dal'], raw_to_cooked_factor: 2.5 }),
  G('Rajma', 'dal', 333, 22.9, 60, 1.3, { aliases: ['kidney beans', 'rajmah'], raw_to_cooked_factor: 2.4 }),
  G('Kabuli Chana', 'dal', 364, 19, 61, 6, { aliases: ['chickpeas', 'chole', 'chhole', 'garbanzo'], raw_to_cooked_factor: 2.4 }),
  G('Soya Chunks', 'soya-chunks', 345, 52, 33, 0.5, { aliases: ['soya', 'soy chunks', 'nutrela', 'meal maker', 'soyabean chunks'], raw_to_cooked_factor: 2.5 }),
  // dairy
  G('Milk (cow, full fat)', 'milk', 62, 3.2, 4.8, 3.6, { aliases: ['doodh', 'dudh', 'milk', 'cow milk'] }),
  G('Dahi (Curd)', 'curd', 60, 3.1, 3, 4, { aliases: ['dahi', 'curd', 'yogurt', 'yoghurt', 'dehi', 'curds'] }),
  G('Paneer', 'paneer', 296, 18.3, 1.2, 22.5, { aliases: ['paneer', 'cottage cheese', 'panir', 'paner'] }),
  G('Ghee', 'fats', 900, 0, 0, 100, { aliases: ['ghee', 'clarified butter', 'desi ghee'] }),
  G('Butter', 'fats', 717, 0.9, 0.1, 81, { aliases: ['butter', 'makhan'] }),
  G('Cooking Oil', 'fats', 900, 0, 0, 100, { aliases: ['oil', 'tel', 'sunflower oil', 'mustard oil', 'refined oil'] }),
  // nuts, sweeteners
  G('Peanuts (raw)', 'nuts', 567, 25.8, 16.1, 49.2, { aliases: ['peanut', 'moongfali', 'mungfali', 'groundnut', 'singdana'] }),
  G('Almonds', 'nuts', 579, 21.2, 21.6, 49.9, { aliases: ['badam', 'almond'] }),
  G('Peanut Butter', 'peanut-butter', 588, 25, 20, 50, { aliases: ['peanut butter', 'pb', 'moongfali butter'] }),
  G('Sugar', 'sweeteners', 398, 0, 99.5, 0, { aliases: ['cheeni', 'chini', 'shakkar', 'sakkar'] }),
  G('Jaggery', 'sweeteners', 383, 0.4, 95, 0.1, { aliases: ['gud', 'gur', 'jaggery'] }),
];

const sample = (
  name: string, brand: string, category: string, k: number, p: number, c: number, f: number, o: Opts,
) =>
  make(name, brand, category, k, p, c, f, o, {
    status: 'flagged',
    source_name: 'SAMPLE: placeholder, not real label data',
    search_count: 1,
  });

export const DEV_SAMPLES: SeedFood[] = [
  sample('Paneer', 'Amul', 'paneer', 290, 18, 2, 22.5, { aliases: ['amul paneer'] }),
  sample('Paneer', 'Milky Mist', 'paneer', 300, 19, 3, 23, { aliases: ['milkymist paneer', 'milky mist paneer'] }),
  sample('Milk', 'Amul', 'milk', 66, 3.1, 4.9, 4.1, { variant: 'Gold', aliases: ['amul gold'] }),
  sample('Milk', 'Amul', 'milk', 48, 3, 5, 1.5, { variant: 'Taaza', aliases: ['amul taaza'] }),
  sample('Whey Protein', 'MuscleBlaze', 'whey', 405, 75, 8, 7, { serving_g: 33, serving_label: '1 scoop = 33g', aliases: ['muscleblaze whey', 'mb whey', 'whey'] }),
  sample('Dahi', 'Amul', 'curd', 62, 3.4, 4.5, 3.5, { aliases: ['amul dahi', 'amul curd'] }),
  sample('Peanut Butter', 'Sundrop', 'peanut-butter', 610, 26, 18, 52, { variant: 'Crunchy', aliases: ['sundrop peanut butter'] }),
];

export const ALL_DEV_FOODS: SeedFood[] = [...GENERICS, ...DEV_SAMPLES];
