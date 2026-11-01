import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { processJob } from '../src/lib/pipeline.ts';
import { createJob, getJob } from '../src/lib/jobs.ts';

const env = { SERPER_API_KEY: 's', GEMINI_API_KEY: 'g' } as any;
const PAGE = 'https://www.fatsecret.co.in/calories-nutrition/milky-mist/panner-regular/100g';
const real = globalThis.fetch;
beforeEach(() => { globalThis.fetch = real; });

const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
const gemini = (o: unknown) => json({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] });
const table = (p: number) => `<html><body>${'<p>menu</p>'.repeat(500)}<table><tr><td>Energy</td><td>296 kcal</td></tr><tr><td>Protein</td><td>${p} g</td></tr><tr><td>Carbohydrate</td><td>1.2 g</td></tr><tr><td>Fat</td><td>22.5 g</td></tr></table></body></html>`;

function mock(opts: { page?: string; snippet?: string; gem: unknown }) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: any) => {
    const u = String(url); calls.push(u);
    if (u.includes('openfoodfacts')) return json({ products: [] });
    if (u.includes('serper.dev')) return json({ organic: [
      { title: 'Food database and calorie counter', link: PAGE, snippet: opts.snippet ?? 'Milky Mist paneer' },
      { title: 'Generic paneer', link: 'https://www.fatsecret.com.au/calories-nutrition/generic/paneer', snippet: 'paneer' },
    ] });
    if (u === PAGE) return new Response(opts.page ?? '<html>loading...</html>', { status: 200 });
    if (u.includes('generativelanguage')) return gemini(opts.gem);
    return new Response('nope', { status: 404 });
  }) as any;
  return calls;
}

async function run(query: string) {
  const job = await createJob(env, query, '1.2.3.4');
  await processJob(env, job.id, query);
  return (await getJob(env, job.id))!;
}

const good = { productName: 'Milky Mist Paneer', brand: 'Milky Mist', basis: 'per_100g', servingGrams: null, kcal: 296, protein: 18.3, carbs: 1.2, fat: 22.5, fibre: null, sugar: null };

test('finds the brand on the second-best page of results and saves it', async () => {
  const calls = mock({ page: table(18.3), gem: good });
  const j = await run('milkymist paneer');
  assert.equal(j.status, 'done', j.message);
  assert.equal(j.unsaved, false);
  assert.equal(j.food?.brand, 'Milky Mist');
  assert.equal(j.food?.status, 'auto_fetched');
  assert.ok(!calls.some((u) => u.includes('generic/paneer')), 'must not read the generic page');
});

test('rejects numbers the model invented (not in the page text)', async () => {
  mock({ page: table(18.3), gem: { ...good, kcal: 310, protein: 25, carbs: 4, fat: 20 }, snippet: 'Milky Mist paneer' });
  const j = await run('milkymist paneer');
  assert.equal(j.status, 'failed');
});

test('falls back to search snippets when the page is JavaScript-only', async () => {
  mock({ page: '<html><div id="app"></div></html>', snippet: 'Milky Mist Paneer per 100g: Energy 296 kcal, Protein 18.3 g, Carbohydrate 1.2 g, Total Fat 22.5 g', gem: good });
  const j = await run('milkymist paneer');
  assert.equal(j.status, 'done', j.message);
  assert.equal(j.food?.brand, 'Milky Mist');
});

test('values that fail category checks are shown once, never saved', async () => {
  const bad = { ...good, protein: 60 };
  mock({ page: table(60), gem: bad });
  const j = await run('milkymist paneer');
  assert.equal(j.status, 'done');
  assert.equal(j.unsaved, true);
  assert.equal(j.food?.status, 'flagged');
});

test('nothing relevant found gives the plain not-found message', async () => {
  globalThis.fetch = (async (u: any) => String(u).includes('serper') ? json({ organic: [] }) : json({ products: [] })) as any;
  const j = await run('zzzz qqqq');
  assert.equal(j.status, 'failed');
  assert.match(j.message ?? '', /could not find a label/);
});
