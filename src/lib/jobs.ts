import type { Food } from './types.ts';
import { adminClient, devStore } from './db.ts';
import type { ServerEnv } from './env.ts';
import { keyProblem } from './keys.ts';

export type JobStatus = 'queued' | 'finding_page' | 'reading_label' | 'validating' | 'done' | 'failed';

export interface Job {
  id: string;
  query: string;
  status: JobStatus;
  food?: Food | null;
  unsaved?: boolean;
  message?: string;
  ip?: string;
  created: number;
}

const mem = new Map<string, Job>();
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

export async function createJob(env: ServerEnv, query: string, ip: string): Promise<Job> {
  const db = adminClient(env);
  if (!db) {
    const j: Job = { id: uid(), query, status: 'queued', ip, created: Date.now() };
    mem.set(j.id, j);
    return j;
  }
  const { data, error } = await db.from('fetch_jobs').insert({ query, ip }).select('id').single();
  if (error && /row-level security/i.test(error.message)) {
    throw new Error(`${keyProblem(env.SUPABASE_SERVICE_ROLE_KEY) ?? 'The Supabase key in SUPABASE_SERVICE_ROLE_KEY is not the secret (service role) key, so the database blocked the write.'} (original: ${error.message})`);
  }
  if (error) throw new Error(`fetch_jobs insert failed: ${error.message} (did you run supabase/migrations/001_init.sql, and is SUPABASE_URL the base URL without /rest/v1/?)`);
  return { id: data.id, query, status: 'queued', ip, created: Date.now() };
}

export async function updateJob(env: ServerEnv, id: string, patch: Partial<Job> & { transient?: unknown }) {
  const db = adminClient(env);
  if (!db) {
    const j = mem.get(id);
    if (j) Object.assign(j, patch);
    return;
  }
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) row.status = patch.status;
  if (patch.food && patch.food.id !== 'unsaved') row.result_food_id = patch.food.id;
  if (patch.message) row.error = patch.message;
  if (patch.transient !== undefined) row.transient = patch.transient;
  await db.from('fetch_jobs').update(row).eq('id', id);
}

export async function getJob(env: ServerEnv, id: string): Promise<Job | null> {
  const db = adminClient(env);
  if (!db) return mem.get(id) ?? null;
  const { data } = await db.from('fetch_jobs').select('*').eq('id', id).maybeSingle();
  if (!data) return null;
  let food: Food | null = null;
  let unsaved = false;
  if (data.result_food_id) {
    const r = await db.from('foods').select('*').eq('id', data.result_food_id).maybeSingle();
    food = (r.data as Food) ?? null;
  } else if (data.transient) {
    food = data.transient as Food;
    unsaved = true;
  }
  return { id: data.id, query: data.query, status: data.status, food, unsaved, message: data.error ?? undefined, created: Date.parse(data.created_at) };
}

/** Rate limits: per-visitor per hour and a global daily cap (protects API credits). */
export async function checkLimits(env: ServerEnv, ip: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const cap = Number(env.DAILY_FETCH_CAP ?? 60);
  const perIp = 5;
  const hourAgo = Date.now() - 3600_000;
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const db = adminClient(env);

  let ipCount = 0, dayCount = 0;
  if (!db) {
    for (const j of mem.values()) {
      if (j.created >= dayStart.getTime()) dayCount++;
      if (j.ip === ip && j.created >= hourAgo) ipCount++;
    }
  } else {
    const a = await db.from('fetch_jobs').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', new Date(hourAgo).toISOString());
    const b = await db.from('fetch_jobs').select('id', { count: 'exact', head: true }).gte('created_at', dayStart.toISOString());
    ipCount = a.count ?? 0; dayCount = b.count ?? 0;
  }
  if (ipCount >= perIp) return { ok: false, message: 'You have reached the limit of 5 lookups per hour. Try again later.' };
  if (dayCount >= cap) return { ok: false, message: 'Daily lookup limit reached. New lookups reopen tomorrow, or pick a similar item from the database.' };
  return { ok: true };
}

export async function saveFood(env: ServerEnv, food: Omit<Food, 'id'> & { confidence: 'low' | 'normal' }): Promise<Food> {
  const db = adminClient(env);
  if (!db) {
    let slug = food.slug;
    if (devStore.foods.some((f) => f.slug === slug)) slug += '-' + Math.random().toString(36).slice(2, 5);
    const f = { ...food, slug, id: slug } as Food;
    devStore.foods.push(f);
    return f;
  }
  const { data, error } = await db.from('foods').upsert(food, { onConflict: 'slug' }).select('*').single();
  if (error) throw new Error(error.message);
  return data as Food;
}

export async function queueReview(env: ServerEnv, row: { query: string; extracted: unknown; source_url?: string | null; failed_checks: string[] }) {
  const db = adminClient(env);
  if (!db) {
    devStore.review.unshift({ id: uid(), created_at: new Date().toISOString(), source_url: null, ...row });
    return;
  }
  const { error } = await db.from('review_queue').insert(row);
  if (error) throw new Error(`review_queue insert failed: ${error.message}`);
}
