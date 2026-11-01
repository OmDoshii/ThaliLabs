import { useMemo, useState } from 'react';
import type { Food, State, Unit } from '../lib/types.ts';
import { availableUnits, fmt, macrosFor, toGrams } from '../lib/calc.ts';
import { FoodLabel } from './FoodLabel.tsx';

/** Per-food calculator used on /nutrition/[slug]. */
export default function FoodCalc({ food }: { food: Food }) {
  const units = availableUnits(food);
  const [qty, setQty] = useState('100');
  const [unit, setUnit] = useState<Unit>('g');
  const [state, setState] = useState<State>('raw');
  const [reported, setReported] = useState(false);

  const n = parseFloat(qty);
  const valid = Number.isFinite(n) && n > 0 && n <= 100000;
  const hasCooked = Boolean(food.raw_to_cooked_factor && food.raw_to_cooked_factor !== 1);
  const portion = useMemo(() => (valid ? macrosFor(food, n, unit, state) : { kcal: 0, protein: 0, carbs: 0, fat: 0 }), [food, n, valid, unit, state]);
  const grams = valid ? toGrams(food, n, unit) : 0;

  async function report() {
    setReported(true);
    fetch('/api/report', { method: 'POST', body: JSON.stringify({ id: food.id }) }).catch(() => {});
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="q" className="block text-sm font-semibold">Amount</label>
          <input id="q" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ''))}
            aria-invalid={!valid} className="mt-1 w-28 rounded-md border-2 border-navy bg-paper px-3 py-2 text-xl display-num" />
        </div>
        <div role="group" aria-label="Unit" className="flex overflow-hidden rounded-md border-2 border-navy">
          {units.map((u) => (
            <button key={u} onClick={() => setUnit(u)} aria-pressed={unit === u}
              className={`px-3.5 py-2.5 text-sm font-semibold ${unit === u ? 'bg-navy text-white' : 'bg-paper hover:bg-chalk'}`}>
              {u === 'g' ? 'grams' : u === 'piece' ? (food.piece_label ?? 'piece') : 'scoop'}
            </button>
          ))}
        </div>
        {hasCooked && (
          <div role="group" aria-label="Raw or cooked" className="flex overflow-hidden rounded-md border-2 border-navy">
            {(['raw', 'cooked'] as State[]).map((s) => (
              <button key={s} onClick={() => setState(s)} aria-pressed={state === s}
                className={`px-3.5 py-2.5 text-sm font-semibold capitalize ${state === s ? 'bg-navy text-white' : 'bg-paper hover:bg-chalk'}`}>{s}</button>
            ))}
          </div>
        )}
      </div>
      {!valid && <p className="mt-2 text-sm text-fat" role="alert">Enter an amount greater than 0.</p>}
      <div className="mt-5">
        <FoodLabel food={food} portion={portion} portionText={valid ? `${fmt(grams)}g${state === 'cooked' && hasCooked ? ' cooked' : ''}` : '—'} />
      </div>
      <div className="mt-3">
        {reported
          ? <p className="text-sm text-protein" role="status">Thanks. We'll check this value.</p>
          : <button onClick={report} className="text-sm underline hover:text-fat">Report wrong value</button>}
      </div>
    </div>
  );
}
