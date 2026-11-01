import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/env.ts';
import { adminClient, devStore } from '../../lib/db.ts';
import { queueReview } from '../../lib/jobs.ts';
import { runChecks } from '../../lib/checks.ts';
import { guessCategory } from '../../lib/pipeline.ts';
import { slugify } from '../../data/seed.ts';

export const prerender = false;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

/** One-way hash so we can rate-limit per visitor without storing their IP address. */
async function hashIp(ip: string, salt: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ip));
  return [...new Uint8Array(d)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * A visitor sends label values for a product we could not find.
 * It goes ONLY to the private review queue. Nothing is public until an admin approves it.
 */
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ message: 'Bad origin.' }, 403);

  let b: any;
  try { b = await request.json(); } catch { return json({ message: 'Invalid request.' }, 400); }
  if (b?.website) return json({ ok: true }); // honeypot field: bots fill it, people never see it

  const t = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const n = (v: unknown) => { const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : NaN; };

  const brand = t(b.brand, 60) || null;
  let name = t(b.name, 80);
  // the form prefills the whole search text: drop a repeated brand so "Zorbo zorbo paneer" is not saved
  if (brand && name.toLowerCase().startsWith(brand.toLowerCase() + ' ')) name = name.slice(brand.length).trim();
  const [kcal, protein, carbs, fat] = [n(b.kcal), n(b.protein), n(b.carbs), n(b.fat)];
  const okNums = [kcal, protein, carbs, fat].every((v) => !Number.isNaN(v) && v >= 0) && kcal <= 950 && [protein, carbs, fat].every((v) => v <= 100);
  if (name.length < 2 || !okNums) {
    return json({ message: 'Enter the product name and all four values per 100g. Calories can be up to 950, the others up to 100.' }, 400);
  }
  const link = t(b.source_url, 300);
  if (link && !/^https:\/\//i.test(link)) return json({ message: 'The link must start with https://' }, 400);

  const env = getEnv(locals);
  const ip = request.headers.get('cf-connecting-ip') ?? clientAddress ?? 'unknown';
  const h = await hashIp(ip, env.ADMIN_SESSION_SECRET ?? 'thalilabs');
  const db = adminClient(env);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();

  // Limits: 3 per visitor per hour, 100 per hour overall. A failed limit check never blocks a real person.
  try {
    if (db) {
      const mine = await db.from('review_queue').select('id', { count: 'exact', head: true }).eq('extracted->>_ip', h).gte('created_at', hourAgo);
      const all = await db.from('review_queue').select('id', { count: 'exact', head: true }).gte('created_at', hourAgo);
      if ((mine.count ?? 0) >= 3) return json({ message: 'You have sent 3 products in the last hour. Please try again later.' }, 429);
      if ((all.count ?? 0) >= 100) return json({ message: 'We are getting a lot of submissions right now. Please try again later.' }, 429);
    } else if (devStore.review.filter((r) => r.extracted?._ip === h && r.created_at > hourAgo).length >= 3) {
      return json({ message: 'You have sent 3 products in the last hour. Please try again later.' }, 429);
    }
  } catch (e: any) { console.error('[suggest] limit check failed:', e?.message ?? e); }

  const query = [brand, name].filter(Boolean).join(' ');
  const category = guessCategory(query);
  const checks = runChecks({ name, category, kcal, protein, carbs, fat, sourceCount: 1 }, query);

  // never collide with (and later overwrite) an existing food: give a taken slug a suffix
  let slug = slugify(query);
  try {
    const taken = db
      ? (await db.from('foods').select('id').eq('slug', slug).maybeSingle()).data
      : devStore.foods.find((f) => f.slug === slug);
    if (taken) slug += '-' + h.slice(0, 4);
  } catch {}

  const extracted = {
    slug, name, brand, variant: null, category, is_generic: !brand,
    kcal, protein, carbs, fat, fibre: null, sugar: null,
    serving_g: null, serving_label: null, piece_weight_g: null, piece_label: null, raw_to_cooked_factor: null,
    source_name: 'Sent by a visitor, checked by us', source_url: link || null,
    fetched_at: new Date().toISOString(), search_count: 0,
    _ip: h, // private: stripped when an admin approves
  };

  try {
    await queueReview(env, { query, extracted, source_url: link || null, failed_checks: ['user_submitted', ...checks.failed] });
  } catch (e: any) {
    console.error('[suggest] could not queue:', e?.message ?? e);
    return json({ message: 'We could not save this right now. Please try again later.' }, 503);
  }
  return json({ ok: true });
};
