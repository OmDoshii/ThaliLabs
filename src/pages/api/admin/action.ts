import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env.ts';
import { adminClient, devStore } from '../../../lib/db.ts';
import { COOKIE } from '../../../lib/auth.ts';
import { slugify } from '../../../data/seed.ts';
import { atwaterOk } from '../../../lib/checks.ts';

export const prerender = false;

/** Admin actions. Auth is enforced by middleware; origin is re-checked here against CSRF. */
export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return new Response('Bad origin', { status: 403 });

  const env = getEnv(locals);
  const f = await request.formData();
  const act = String(f.get('act') ?? '');
  const id = String(f.get('id') ?? '');
  const db = adminClient(env);

  if (act === 'logout') {
    cookies.delete(COOKIE, { path: '/' });
    return redirect('/admin/login');
  }

  const status = act === 'verify' ? 'verified' : act === 'flag' ? 'flagged' : null;
  if (status) {
    if (db) await db.from('foods').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    else { const x = devStore.foods.find((y) => y.id === id); if (x) x.status = status; }
  } else if (act === 'delete') {
    if (db) await db.from('foods').delete().eq('id', id);
    else devStore.foods.splice(devStore.foods.findIndex((y) => y.id === id), 1);
  } else if (act === 'edit') {
    const n = (k: string) => Number(f.get(k));
    const patch = { kcal: n('kcal'), protein: n('protein'), carbs: n('carbs'), fat: n('fat'), status: 'verified', updated_at: new Date().toISOString() };
    if ([patch.kcal, patch.protein, patch.carbs, patch.fat].some((v) => !Number.isFinite(v) || v < 0 || v > 1000)) {
      return redirect('/admin?e=invalid');
    }
    if (db) await db.from('foods').update(patch).eq('id', id);
    else { const x = devStore.foods.find((y) => y.id === id); if (x) Object.assign(x, patch); }
  } else if (act === 'add') {
    const t = (k: string, max = 80) => String(f.get(k) ?? '').trim().slice(0, max) || null;
    const n = (k: string) => { const v = String(f.get(k) ?? '').trim(); return v === '' ? null : Number(v); };
    const name = t('name'), brand = t('brand', 60), variant = t('variant', 60);
    const category = (t('category', 40) ?? 'other').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const [kcal, protein, carbs, fat] = [n('kcal'), n('protein'), n('carbs'), n('fat')];
    const optional = [n('fibre'), n('sugar'), n('serving_g'), n('piece_weight_g')];
    const bad = (v: number | null, max = 1000) => v === null || !Number.isFinite(v) || v < 0 || v > max;
    if (!name || bad(kcal) || bad(protein, 100) || bad(carbs, 100) || bad(fat, 100) || optional.some((v) => v !== null && bad(v))) {
      return redirect('/admin?e=invalid_add');
    }
    const sourceUrl = t('source_url', 300);
    if (sourceUrl && !/^https?:\/\//.test(sourceUrl)) return redirect('/admin?e=invalid_add');
    const row = {
      slug: slugify([brand, name, variant].filter(Boolean).join(' ')), name, brand, variant, category,
      is_generic: !brand, kcal, protein, carbs, fat,
      fibre: optional[0], sugar: optional[1], serving_g: optional[2], serving_label: t('serving_label', 40),
      piece_weight_g: optional[3], piece_label: t('piece_label', 40),
      source_name: sourceUrl ? 'Brand label / website' : 'Entered by admin from pack label',
      source_url: sourceUrl, fetched_at: new Date().toISOString(), status: 'verified', confidence: 'normal', search_count: 0,
    };
    if (db) {
      const { error } = await db.from('foods').upsert(row, { onConflict: 'slug' });
      if (error) return redirect('/admin?e=save_failed');
      // optional comma-separated search aliases ("amul paneer, amool paneer")
      const aliases = String(f.get('aliases') ?? '').split(',').map((a) => a.trim().toLowerCase()).filter(Boolean).slice(0, 10);
      if (aliases.length) {
        const { data: saved } = await db.from('foods').select('id').eq('slug', row.slug).maybeSingle();
        if (saved) await db.from('aliases').insert(aliases.map((alias) => ({ food_id: saved.id, alias })));
      }
    } else {
      devStore.foods.push({ ...row, id: row.slug } as any);
    }
    const warn = atwaterOk({ kcal: kcal!, protein: protein!, carbs: carbs!, fat: fat! }) ? '' : '&w=atwater';
    return redirect('/admin?ok=added' + warn);
  } else if (act === 'approve') {
    // promote a review-queue item to a public food after manual check
    const clean = (x: any) => Object.fromEntries(Object.entries(x ?? {}).filter(([k]) => !k.startsWith('_')));
    if (db) {
      const { data: q } = await db.from('review_queue').select('*').eq('id', id).maybeSingle();
      if (q) {
        const { error } = await db.from('foods').upsert({ ...clean(q.extracted), status: 'verified', confidence: 'normal' }, { onConflict: 'slug' });
        if (error) return redirect('/admin?e=save_failed');
        await db.from('review_queue').delete().eq('id', id);
      }
    } else {
      const i = devStore.review.findIndex((r) => r.id === id);
      if (i >= 0) {
        const row = { ...clean(devStore.review[i].extracted), status: 'verified', confidence: 'normal' } as any;
        row.id = row.slug;
        devStore.foods.push(row);
        devStore.review.splice(i, 1);
      }
    }
  } else if (act === 'reject') {
    if (db) await db.from('review_queue').delete().eq('id', id);
    else { const i = devStore.review.findIndex((r) => r.id === id); if (i >= 0) devStore.review.splice(i, 1); }
  }
  return redirect('/admin');
};
