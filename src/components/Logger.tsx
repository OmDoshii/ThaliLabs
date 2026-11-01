import { useEffect, useMemo, useRef, useState } from 'react';
import type { Food, LogEntry, State, Unit } from '../lib/types.ts';
import { availableUnits, fmt, macrosFor, sumMacros, toGrams } from '../lib/calc.ts';
import { FoodLabel, foodTitle } from './FoodLabel.tsx';
import { useDayLog, useSavedMeals } from './storage.ts';

type FetchState =
  | { phase: 'idle' }
  | { phase: 'running'; step: string }
  | { phase: 'failed'; message: string; transient?: Food };

const STEP_TEXT: Record<string, string> = {
  queued: 'Starting',
  finding_page: 'Finding the product page',
  reading_label: 'Reading the nutrition label',
  validating: 'Checking the numbers',
};

export default function Logger() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Food | null>(null);
  const [transient, setTransient] = useState(false);
  const [qty, setQty] = useState('100');
  const [unit, setUnit] = useState<Unit>('g');
  const [state, setState] = useState<State>('raw');
  const [fetchState, setFetchState] = useState<FetchState>({ phase: 'idle' });
  const [mealName, setMealName] = useState('');

  const log = useDayLog();
  const meals = useSavedMeals();
  const abortRef = useRef<AbortController | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelBlur = () => { if (blurTimer.current) clearTimeout(blurTimer.current); };

  // Debounced fuzzy search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ac.signal });
        const j = await r.json();
        setResults(j.results ?? []);
        setActive(-1);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setResults([]);
      } finally {
        if (!ac.signal.aborted) setSearching(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  const units = selected ? availableUnits(selected) : (['g'] as Unit[]);
  const hasCookedFactor = Boolean(selected?.raw_to_cooked_factor && selected.raw_to_cooked_factor !== 1);
  const qtyNum = parseFloat(qty);
  const qtyValid = Number.isFinite(qtyNum) && qtyNum > 0 && qtyNum <= 100000;

  const portion = useMemo(
    () => (selected && qtyValid ? macrosFor(selected, qtyNum, unit, state) : { kcal: 0, protein: 0, carbs: 0, fat: 0 }),
    [selected, qtyNum, qtyValid, unit, state],
  );
  const grams = selected && qtyValid ? toGrams(selected, qtyNum, unit) : 0;

  function choose(f: Food, isTransient = false) {
    setSelected(f);
    setTransient(isTransient);
    setOpen(false);
    setQuery(foodTitle(f));
    setUnit('g');
    setState('raw');
    setQty(f.serving_g && /scoop/i.test(f.serving_label ?? '') ? '1' : '100');
    if (f.serving_g && /scoop/i.test(f.serving_label ?? '')) setUnit('scoop');
    if (!isTransient) fetch('/api/pick', { method: 'POST', body: JSON.stringify({ id: f.id }) }).catch(() => {});
  }

  function addToLog() {
    if (!selected || !qtyValid || transient) return;
    log.add({
      foodId: selected.id, slug: selected.slug, name: selected.name, brand: selected.brand, variant: selected.variant,
      quantity: qtyNum, unit, state, grams, ...portion,
    });
  }

  async function runFetch() {
    const q = query.trim();
    if (q.length < 3) return;
    setFetchState({ phase: 'running', step: 'queued' });
    try {
      const r = await fetch('/api/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
      let j: any = {};
      try { j = await r.json(); } catch { j = { message: `Server error (${r.status}). Please try again in a minute.` }; }
      if (!r.ok) {
        setFetchState({ phase: 'failed', message: j.message ?? 'Could not start the search. Try again in a minute.' });
        return;
      }
      // poll the job
      for (let i = 0; i < 40; i++) {
        await new Promise((res) => setTimeout(res, 1500));
        const s = await (await fetch(`/api/fetch-status?id=${j.id}`)).json();
        if (s.status === 'done' && s.food) {
          setFetchState({ phase: 'idle' });
          choose(s.food, Boolean(s.unsaved));
          return;
        }
        if (s.status === 'failed') {
          setFetchState({ phase: 'failed', message: s.message ?? 'We could not find reliable label data for this.', transient: s.food });
          return;
        }
        setFetchState({ phase: 'running', step: s.status });
      }
      setFetchState({ phase: 'failed', message: 'This is taking too long. Please try again.' });
    } catch {
      setFetchState({ phase: 'failed', message: 'Network problem. Check your connection and try again.' });
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && active >= 0 && results[active]) { e.preventDefault(); choose(results[active]); }
    else if (e.key === 'Escape') setOpen(false);
  }

  const totals = useMemo(() => sumMacros(log.entries), [log.entries]);
  const noMatch = query.trim().length >= 3 && !searching && results.length === 0 && !selected;
  const portionText = qtyValid ? `${fmt(grams)}g${state === 'cooked' && hasCookedFactor ? ' cooked' : ''}` : '—';

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
      {/* ------------------------------------------------ search + label */}
      <div>
        <label htmlFor="food-search" className="display text-2xl text-ultramarine">What did you eat?</label>
        <div className="relative mt-2">
          <input
            id="food-search"
            role="combobox"
            aria-expanded={open && results.length > 0}
            aria-controls="food-suggest"
            aria-autocomplete="list"
            autoComplete="off"
            value={query}
            onChange={(e) => { cancelBlur(); setQuery(e.target.value); setOpen(true); setSelected(null); setFetchState({ phase: 'idle' }); }}
            onFocus={() => { cancelBlur(); setOpen(true); }}
            onBlur={() => { cancelBlur(); blurTimer.current = setTimeout(() => setOpen(false), 150); }}
            onKeyDown={onKey}
            placeholder="Try “milkymist paneer”, “amul taaza”, “tamatar”"
            className="w-full rounded-md border-2 border-navy bg-paper px-4 py-3.5 text-lg shadow-[4px_4px_0_0_var(--color-marigold)] placeholder:text-muted/70"
          />
          {searching && <span className="absolute right-4 top-4 text-sm text-muted" aria-live="polite">Searching</span>}

          {open && results.length > 0 && (
            <ul id="food-suggest" role="listbox" className="absolute z-20 mt-2 w-full overflow-hidden rounded-md border-2 border-navy bg-paper shadow-lg">
              {results.map((f, i) => (
                <li
                  key={f.id}
                  role="option"
                  aria-selected={i === active}
                  className="suggest flex cursor-pointer items-center justify-between gap-3 border-b border-rule px-4 py-2.5 last:border-b-0 hover:bg-[#e8ecfb]"
                  onMouseDown={(e) => { e.preventDefault(); choose(f); }}
                >
                  <span>
                    <span className="font-semibold">{foodTitle(f)}</span>
                    <span className="ml-2 text-xs text-muted">{f.is_generic ? 'generic' : 'brand'}</span>
                  </span>
                  <span className="display-num text-sm text-muted">{fmt(f.kcal)} kcal/100g</span>
                </li>
              ))}
              {query.trim().length >= 3 && (
                <li
                  role="presentation"
                  className="cursor-pointer bg-chalk px-4 py-2.5 text-sm font-semibold text-ultramarine hover:bg-[#e8ecfb]"
                  onMouseDown={(e) => { e.preventDefault(); setOpen(false); runFetch(); }}
                >
                  Not your brand? Look up “{query.trim()}” online
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Always visible once there are results, so brand lookup is never hidden behind a generic match */}
        {!selected && !noMatch && results.length > 0 && query.trim().length >= 3 && fetchState.phase === 'idle' && (
          <p className="mt-3 text-sm text-muted">
            Can't see your brand?{' '}
            <button onClick={runFetch} className="font-semibold text-ultramarine underline hover:text-ultramarine-deep">
              Look up “{query.trim()}” online
            </button>
          </p>
        )}

        {noMatch && fetchState.phase === 'idle' && (
          <div className="mt-4 rounded-md border-2 border-dashed border-ultramarine bg-paper p-4">
            <p className="font-semibold">“{query.trim()}” isn't in the database yet.</p>
            <p className="mt-1 text-sm text-muted">We can look up the label online. It takes about 20 seconds, and the numbers are checked before they're used.</p>
            <button onClick={runFetch} className="mt-3 rounded-md bg-ultramarine px-4 py-2.5 font-semibold text-white hover:bg-ultramarine-deep">
              Look up “{query.trim()}”
            </button>
          </div>
        )}

        {fetchState.phase === 'running' && (
          <div className="mt-4 rounded-md border-2 border-navy bg-paper p-4" role="status" aria-live="polite">
            <p className="font-semibold">{STEP_TEXT[fetchState.step] ?? 'Working'}…</p>
            <div className="mt-3 h-2 overflow-hidden rounded-sm bg-rule">
              <div className="h-full w-1/3 animate-[slide_1.2s_ease-in-out_infinite] bg-marigold" />
            </div>
            <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
          </div>
        )}

        {fetchState.phase === 'failed' && (
          <div className="mt-4 rounded-md border-2 border-fat bg-paper p-4" role="alert">
            <p className="font-semibold text-fat">{fetchState.message}</p>
            <p className="mt-1 text-sm text-muted">Try adding the pack size or the exact variant, or pick the generic food instead.</p>
            <button onClick={runFetch} className="mt-3 rounded-md border-2 border-navy px-3 py-1.5 text-sm font-semibold hover:bg-chalk">Try again</button>
            <SuggestForm initialName={query.trim()} />
          </div>
        )}

        {selected?.is_generic && fetchState.phase === 'idle' && (
          <p className="mt-3 rounded-md bg-marigold/25 px-3 py-2 text-sm">
            This is the generic average. For an exact brand, type the brand and product, for example “Amul paneer”, and pick it from the list.
            {' '}<button onClick={() => { setSelected(null); setQuery(''); document.getElementById('food-search')?.focus(); }} className="font-semibold underline">Search again</button>
          </p>
        )}

        {selected && (
          <div className="mt-6">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="qty" className="block text-sm font-semibold">Amount</label>
                <input
                  id="qty" inputMode="decimal" value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ''))}
                  aria-invalid={!qtyValid}
                  className="mt-1 w-28 rounded-md border-2 border-navy bg-paper px-3 py-2 text-xl display-num"
                />
              </div>
              <div role="group" aria-label="Unit" className="flex overflow-hidden rounded-md border-2 border-navy">
                {units.map((u) => (
                  <button
                    key={u} onClick={() => setUnit(u)} aria-pressed={unit === u}
                    className={`px-3.5 py-2.5 text-sm font-semibold ${unit === u ? 'bg-navy text-white' : 'bg-paper hover:bg-chalk'}`}
                  >
                    {u === 'g' ? 'grams' : u === 'piece' ? (selected.piece_label ?? 'piece') : 'scoop'}
                  </button>
                ))}
              </div>
              {hasCookedFactor && (
                <div role="group" aria-label="Raw or cooked" className="flex overflow-hidden rounded-md border-2 border-navy">
                  {(['raw', 'cooked'] as State[]).map((s) => (
                    <button
                      key={s} onClick={() => setState(s)} aria-pressed={state === s}
                      className={`px-3.5 py-2.5 text-sm font-semibold capitalize ${state === s ? 'bg-navy text-white' : 'bg-paper hover:bg-chalk'}`}
                    >{s}</button>
                  ))}
                </div>
              )}
            </div>
            {!qtyValid && <p className="mt-2 text-sm text-fat" role="alert">Enter an amount greater than 0.</p>}
            {unit === 'piece' && selected.piece_weight_g && (
              <p className="mt-2 text-xs text-muted">1 {selected.piece_label} = {fmt(selected.piece_weight_g)}g</p>
            )}
            {selected.serving_label && unit === 'scoop' && <p className="mt-2 text-xs text-muted">{selected.serving_label}</p>}
            {state === 'cooked' && hasCookedFactor && (
              <p className="mt-2 text-xs text-muted">Cooked weight is about {selected.raw_to_cooked_factor}× the raw weight, so each gram of cooked food has fewer calories.</p>
            )}

            <div className="mt-4">
              <FoodLabel food={selected} portion={portion} portionText={portionText} unsaved={transient} />
            </div>

            {transient ? (
              <p className="mt-3 rounded-md bg-fat/10 p-3 text-sm text-fat">These numbers failed our checks, so they were not saved and can't be logged. Compare with the pack before relying on them.</p>
            ) : (
              <button
                onClick={addToLog} disabled={!qtyValid}
                className="mt-4 w-full rounded-md bg-marigold px-5 py-3.5 text-lg font-bold text-navy shadow-[4px_4px_0_0_var(--color-navy)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_var(--color-navy)] disabled:opacity-50"
              >
                Add to today's log
              </button>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------ daily log */}
      <aside id="log" aria-label="Today's log" className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-md bg-navy p-5 text-white">
          <h2 className="display text-2xl">Today</h2>
          <p className="display-num mt-2 text-6xl text-marigold" aria-live="polite">
            {fmt(totals.kcal)}<span className="ml-2 text-xl text-white/70">kcal</span>
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[['Protein', totals.protein, 'protein'], ['Carbs', totals.carbs, 'carbs'], ['Fat', totals.fat, 'fat']].map(([n, v, c]) => (
              <div key={n as string} className="rounded bg-white/10 py-2">
                <dt className="flex items-center justify-center gap-1.5 text-xs text-white/70">
                  <span className="h-2 w-2 rounded-full" style={{ background: `var(--color-${c})`, filter: 'brightness(1.4)' }} aria-hidden />{n as string}
                </dt>
                <dd className="display-num text-xl">{fmt(v as number, 1)}g</dd>
              </div>
            ))}
          </dl>
        </div>

        {!log.persistOk && <p className="mt-2 text-xs text-fat" role="alert">Your browser blocked saving. The log works now but will clear when you close the tab.</p>}

        {log.ready && log.entries.length === 0 ? (
          <p className="mt-4 rounded-md border-2 border-dashed border-rule p-4 text-sm text-muted">Nothing logged yet. Search for a food and add it. Your log stays on this device.</p>
        ) : (
          <ul className="mt-3 divide-y divide-rule rounded-md border-2 border-navy bg-paper">
            {log.entries.map((e: LogEntry) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{foodTitle(e)}</p>
                  <p className="text-xs text-muted">
                    {fmt(e.quantity, e.quantity % 1 ? 1 : 0)} {e.unit === 'g' ? 'g' : e.unit}{e.state === 'cooked' ? ' cooked' : ''} · P {fmt(e.protein, 1)} · C {fmt(e.carbs, 1)} · F {fmt(e.fat, 1)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="display-num">{fmt(e.kcal)}</span>
                  <button onClick={() => log.remove(e.id)} aria-label={`Remove ${foodTitle(e)}`} className="rounded p-1.5 text-muted hover:bg-chalk hover:text-fat">✕</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {log.entries.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={mealName} onChange={(e) => setMealName(e.target.value)} placeholder="Name this meal"
              aria-label="Meal name" className="min-w-0 flex-1 rounded-md border-2 border-navy bg-paper px-3 py-2 text-sm"
            />
            <button
              onClick={() => { meals.save(mealName, log.entries); setMealName(''); }}
              className="rounded-md bg-ultramarine px-3 py-2 text-sm font-semibold text-white hover:bg-ultramarine-deep"
            >Save meal</button>
            <button onClick={log.clear} className="rounded-md border-2 border-navy px-3 py-2 text-sm font-semibold hover:bg-chalk">Clear day</button>
          </div>
        )}

        {meals.meals.length > 0 && (
          <div className="mt-6">
            <h3 className="display text-xl">Saved meals</h3>
            <ul className="mt-2 space-y-2">
              {meals.meals.map((m) => {
                const t = sumMacros(m.entries);
                return (
                  <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border-2 border-navy bg-paper px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{m.name}</p>
                      <p className="text-xs text-muted">{m.entries.length} items · {fmt(t.kcal)} kcal · {fmt(t.protein, 1)}g protein</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => log.addMany(m.entries)} className="rounded bg-marigold px-2.5 py-1.5 text-sm font-semibold text-navy">Add</button>
                      <button onClick={() => meals.remove(m.id)} aria-label={`Delete ${m.name}`} className="rounded p-1.5 text-muted hover:text-fat">✕</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}


/** Visitor sends label values for a product we could not find. Goes to the private review queue. */
function SuggestForm({ initialName }: { initialName: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ brand: '', name: initialName, kcal: '', protein: '', carbs: '', fat: '', source_url: '', website: '' });
  const [st, setSt] = useState<{ phase: 'idle' | 'sending' | 'done' | 'error'; message?: string }>({ phase: 'idle' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSt({ phase: 'sending' });
    try {
      const r = await fetch('/api/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      let j: any = {};
      try { j = await r.json(); } catch {}
      if (r.ok) setSt({ phase: 'done' });
      else setSt({ phase: 'error', message: j.message ?? `Could not send (error ${r.status}). Please try again later.` });
    } catch {
      setSt({ phase: 'error', message: 'Network problem. Check your connection and try again.' });
    }
  }

  if (st.phase === 'done') {
    return <p className="mt-4 rounded-md bg-protein/10 p-3 text-sm font-semibold text-protein" role="status">Thanks. We will check it against the pack before it appears in search.</p>;
  }
  if (!open) {
    return (
      <p className="mt-4 text-sm">
        Have the pack in front of you?{' '}
        <button onClick={() => setOpen(true)} className="font-semibold text-ultramarine underline hover:text-ultramarine-deep">Send us the label values</button>
      </p>
    );
  }
  const field = 'mt-1 w-full rounded-md border-2 border-rule bg-paper px-2.5 py-2 font-normal';
  return (
    <form onSubmit={send} className="mt-4 border-t border-rule pt-4">
      <p className="text-sm text-muted">Copy the numbers per 100g from the nutrition table on the pack. We check every submission before it goes live.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Brand<input value={f.brand} onChange={set('brand')} placeholder="Milky Mist" className={field} /></label>
        <label className="text-sm font-semibold">Product *<input value={f.name} onChange={set('name')} required placeholder="Paneer" className={field} /></label>
        <label className="text-sm font-semibold">Calories (kcal) *<input value={f.kcal} onChange={set('kcal')} required inputMode="decimal" className={field} /></label>
        <label className="text-sm font-semibold">Protein (g) *<input value={f.protein} onChange={set('protein')} required inputMode="decimal" className={field} /></label>
        <label className="text-sm font-semibold">Carbs (g) *<input value={f.carbs} onChange={set('carbs')} required inputMode="decimal" className={field} /></label>
        <label className="text-sm font-semibold">Fat (g) *<input value={f.fat} onChange={set('fat')} required inputMode="decimal" className={field} /></label>
        <label className="text-sm font-semibold sm:col-span-2">Link to the brand page (optional)<input value={f.source_url} onChange={set('source_url')} placeholder="https://" className={field} /></label>
        {/* honeypot: hidden from people, bots fill it */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label>
        </div>
      </div>
      {st.phase === 'error' && <p className="mt-3 text-sm text-fat" role="alert">{st.message}</p>}
      <button disabled={st.phase === 'sending'} className="mt-3 rounded-md bg-ultramarine px-4 py-2.5 font-semibold text-white hover:bg-ultramarine-deep disabled:opacity-60">
        {st.phase === 'sending' ? 'Sending' : 'Send for review'}
      </button>
    </form>
  );
}
