import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankHits, relevantText, valuesAppearIn, safePublicUrl, plausible, looksNutritional } from '../src/lib/extract.ts';

test('rankHits uses URL words when titles are useless, and drops unrelated pages', () => {
  const hits = [
    { title: 'Food database and calorie counter', link: 'https://www.fatsecret.co.in/calories-nutrition/milky-mist/panner-regular/100g' },
    { title: 'Food database and calorie counter', link: 'https://www.fatsecret.com.au/calories-nutrition/generic/paneer' },
    { title: 'Gopala Paneer 300g', link: 'https://www.paknsave.co.nz/shop/product/5007219' },
    { title: 'Milky Mist video', link: 'https://www.youtube.com/watch?v=abc' },
  ];
  const r = rankHits('milkymist paneer', hits);
  assert.equal(r.length, 1);
  assert.match(r[0].link, /milky-mist/);
});

test('blocked and unsafe hosts are refused', () => {
  assert.ok(!safePublicUrl('https://www.youtube.com/x'));
  assert.ok(!safePublicUrl('http://example.com'));
  assert.ok(!safePublicUrl('https://127.0.0.1/x'));
  assert.ok(safePublicUrl('https://www.bigbasket.com/pb/x'));
});

test('relevantText finds a nutrition table buried deep in a long page and JSON-LD', () => {
  const filler = '<p>lorem ipsum dolor sit amet</p>'.repeat(3000);
  const html = `<html><script type="application/ld+json">{"@type":"NutritionInformation","proteinContent":"18 g"}</script>${filler}<table><tr><td>Energy</td><td>296 kcal</td></tr><tr><td>Protein</td><td>18.3 g</td></tr></table>${filler}</html>`;
  const t = relevantText(html);
  assert.match(t, /proteinContent/);
  assert.match(t, /Energy 296 kcal/);
  assert.ok(looksNutritional(t));
  assert.ok(t.length <= 9000);
});

test('valuesAppearIn rejects invented numbers and accepts real ones', () => {
  const text = 'Energy 296 kcal Protein 18.3 g Carbohydrate 1.2 g Total Fat 22.5 g';
  assert.ok(valuesAppearIn(text, [296, 18.3, 1.2, 22.5]));
  assert.ok(!valuesAppearIn(text, [310, 25, 1.2, 22.5]));       // 2 of 4 only
  assert.ok(!valuesAppearIn('Protein 118 g', [18, 1, 2, 3]));   // 18 inside 118 must not count
});

test('plausible bounds', () => {
  assert.ok(plausible({ kcal: 300, protein: 18, carbs: 3, fat: 22 }));
  assert.ok(!plausible({ kcal: 3000, protein: 18, carbs: 3, fat: 22 }));
  assert.ok(!plausible({ kcal: 300, protein: 180, carbs: 3, fat: 22 }));
});
