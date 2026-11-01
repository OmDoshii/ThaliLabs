import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Food } from './types.ts';
import { ALL_DEV_FOODS } from '../data/seed.ts';
import { searchLocal } from './fuzzy.ts';
import { getEnv, hasSupabase, type ServerEnv } from './env.ts';

/** Service-role client. SERVER ONLY. Bypasses RLS, so it must never reach the browser. */
export function adminClient(env: ServerEnv): SupabaseClient | null {
  if (!hasSupabase(env)) return null;
  return createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// In-memory store used only when Supabase is not configured (local dev).
const devFoods: Food[] = ALL_DEV_FOODS.map((f) => ({ ...f }));
export const devStore = { foods: devFoods, review: [] as any[] };

export async function searchFoods(locals: any, q: string, limit = 8): Promise<Food[]> {
  const env = getEnv(locals);
  const db = adminClient(env);
  if (!db) return searchLocal(devStore.foods as any, q, limit);
  const { data, error } = await db.rpc('search_foods', { q, lim: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as Food[];
}

export async function getFoodBySlug(locals: any, slug: string): Promise<Food | null> {
  const env = getEnv(locals);
  const db = adminClient(env);
  if (!db) return devStore.foods.find((f) => f.slug === slug) ?? null;
  const { data } = await db.from('foods').select('*').eq('slug', slug).maybeSingle();
  return (data as Food) ?? null;
}

export async function listFoods(locals: any, opts: { category?: string; brand?: string; limit?: number } = {}): Promise<Food[]> {
  const env = getEnv(locals);
  const db = adminClient(env);
  const limit = opts.limit ?? 500;
  if (!db) {
    return devStore.foods
      .filter((f) => (!opts.category || f.category === opts.category) && (!opts.brand || f.brand === opts.brand))
      .slice(0, limit);
  }
  let q = db.from('foods').select('*').order('is_generic', { ascending: false }).order('name').limit(limit);
  if (opts.category) q = q.eq('category', opts.category);
  if (opts.brand) q = q.eq('brand', opts.brand);
  const { data } = await q;
  return (data ?? []) as Food[];
}

export async function bumpSearchCount(locals: any, id: string): Promise<void> {
  const env = getEnv(locals);
  const db = adminClient(env);
  if (!db) {
    const f = devStore.foods.find((x) => x.id === id);
    if (f) f.search_count++;
    return;
  }
  await db.rpc('bump_search_count', { food: id });
}
