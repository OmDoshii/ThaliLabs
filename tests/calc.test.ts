import { test } from 'node:test';
import assert from 'node:assert/strict';
import { macrosFor, toGrams, sumMacros, availableUnits } from '../src/lib/calc.ts';
import { atwaterOk, normalizeToPer100g, nameMatchScore, runChecks } from '../src/lib/checks.ts';
import type { Food } from '../src/lib/types.ts';

const base: Food = {
  id: '1', slug: 'x', name: 'X', brand: null, variant: null, category: 'test', is_generic: true,
  kcal: 100, protein: 10, carbs: 10, fat: 2, fibre: null, sugar: null,
  serving_g: null, serving_label: null, piece_weight_g: null, piece_label: null,
  raw_to_cooked_factor: null, source_name: null, source_url: null, fetched_at: null,
  status: 'verified', search_count: 0,
};

test('grams formula', () => {
  const m = macrosFor(base, 250, 'g', 'raw');
  assert.equal(m.kcal, 250);
  assert.equal(m.protein, 25);
});

test('pieces use piece weight', () => {
  const egg = { ...base, piece_weight_g: 50 };
  assert.equal(toGrams(egg, 3, 'piece'), 150);
  assert.deepEqual(availableUnits(egg), ['g', 'piece']);
});

test('scoops use label serving size', () => {
  const whey = { ...base, serving_g: 33, serving_label: '1 scoop = 33g' };
  assert.equal(toGrams(whey, 2, 'scoop'), 66);
  assert.ok(availableUnits(whey).includes('scoop'));
});

test('cooked rice: 300g cooked at factor 3 equals 100g raw', () => {
  const rice = { ...base, kcal: 350, raw_to_cooked_factor: 3 };
  const cooked = macrosFor(rice, 300, 'g', 'cooked');
  const raw = macrosFor(rice, 100, 'g', 'raw');
  assert.equal(cooked.kcal, raw.kcal);
});

test('negative / NaN quantity yields zero', () => {
  assert.equal(toGrams(base, -5, 'g'), 0);
  assert.equal(toGrams(base, NaN, 'g'), 0);
});

test('sumMacros totals', () => {
  const t = sumMacros([{ kcal: 1, protein: 2, carbs: 3, fat: 4 }, { kcal: 10, protein: 20, carbs: 30, fat: 40 }]);
  assert.deepEqual(t, { kcal: 11, protein: 22, carbs: 33, fat: 44 });
});

test('atwater accepts a consistent label and rejects a bad one', () => {
  assert.ok(atwaterOk({ kcal: 321, protein: 20, carbs: 3, fat: 25 })); // 80+12+225 = 317
  assert.ok(!atwaterOk({ kcal: 500, protein: 20, carbs: 3, fat: 25 }));
});

test('per-serving values normalise to per 100g', () => {
  const v = normalizeToPer100g({ kcal: 120, protein: 24, carbs: 3, fat: 1.5 }, 30);
  assert.equal(v.protein, 80);
  assert.equal(v.kcal, 400);
});

test('name match tolerates typos', () => {
  assert.ok(nameMatchScore('milkymist paneer', 'Milky Mist Paneer 200g') >= 0.99);
  assert.ok(nameMatchScore('amul paneer', 'Milky Mist Paneer 200g') < 0.6);
  assert.ok(nameMatchScore('milky mist paneer', 'Milky Mist Paneer 200g') >= 0.99);
  assert.ok(nameMatchScore('amul paner', 'Amul Fresh Paneer') >= 0.99);
});

test('runChecks flags paneer with whey-like protein', () => {
  const r = runChecks(
    { name: 'paneer', category: 'paneer', kcal: 400, protein: 60, carbs: 3, fat: 25, sourceCount: 1 },
    'paneer',
  );
  assert.ok(!r.passed);
  assert.ok(r.failed.includes('protein_out_of_range'));
  assert.equal(r.confidence, 'low');
});

test('runChecks passes a plausible paneer', () => {
  const r = runChecks(
    { name: 'Amul Paneer', category: 'paneer', kcal: 296, protein: 18, carbs: 3, fat: 23, fetchedProductName: 'Amul Fresh Paneer', sourceCount: 2 },
    'amul paneer',
  );
  assert.ok(r.passed, r.failed.join(','));
  assert.equal(r.confidence, 'normal');
});
