import type { Food, Macros } from '../lib/types.ts';
import { fmt } from '../lib/calc.ts';

export const foodTitle = (f: Pick<Food, 'brand' | 'name' | 'variant'>) =>
  [f.brand, f.name, f.variant].filter(Boolean).join(' ');

export function StatusBadge({ status }: { status: Food['status'] | 'unsaved' }) {
  const map = {
    verified: { t: 'Verified', c: 'bg-protein text-white' },
    auto_fetched: { t: 'Auto-fetched', c: 'bg-marigold text-navy' },
    flagged: { t: 'Sample / unchecked', c: 'bg-fat text-white' },
    unsaved: { t: 'Shown once, not saved', c: 'bg-fat text-white' },
  } as const;
  const s = map[status];
  return <span className={`rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${s.c}`}>{s.t}</span>;
}

/** Share of calories from each macro (Atwater factors), for the stacked bar. */
function calorieShare(m: Macros) {
  const p = m.protein * 4, c = m.carbs * 4, f = m.fat * 9;
  const total = p + c + f || 1;
  return { p: p / total, c: c / total, f: f / total };
}

function Row({ label, per100, portion, color, bold = false }: { label: string; per100: string; portion: string; color?: string; bold?: boolean }) {
  return (
    <div className="label-rule-thin grid grid-cols-[1fr_auto_auto] items-baseline gap-x-5 py-1.5 first:border-t-0">
      <span className={`flex items-center gap-2 ${bold ? 'font-bold' : ''}`}>
        {color && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden />}
        {label}
      </span>
      <span className="w-16 text-right text-muted">{per100}</span>
      <span className={`w-20 text-right display-num text-lg ${bold ? 'text-ultramarine' : ''}`}>{portion}</span>
    </div>
  );
}

export function FoodLabel({
  food, portion, portionText, unsaved = false,
}: {
  food: Food; portion: Macros; portionText: string; unsaved?: boolean;
}) {
  const share = calorieShare(portion);
  const hasPortion = portion.kcal > 0;
  return (
    <section className="label-card p-4 sm:p-5" aria-label={`Nutrition for ${foodTitle(food)}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="display text-3xl sm:text-4xl">{foodTitle(food)}</h3>
          <p className="mt-1 text-sm text-muted">
            {food.is_generic ? 'Generic' : 'Branded'} · {food.category.replace(/-/g, ' ')}
          </p>
        </div>
        <StatusBadge status={unsaved ? 'unsaved' : food.status} />
      </div>

      <div className="label-rule-thick mt-4 pt-2">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-5 text-xs font-semibold text-muted">
          <span>Nutrition</span>
          <span className="w-16 text-right">per 100g</span>
          <span className="w-20 text-right">{portionText}</span>
        </div>
      </div>
      <div className="label-rule-mid mt-1 pt-1">
        <Row label="Calories" bold per100={fmt(food.kcal)} portion={`${fmt(portion.kcal)} kcal`} />
        <Row label="Protein" color="var(--color-protein)" per100={`${fmt(food.protein, 1)}g`} portion={`${fmt(portion.protein, 1)}g`} />
        <Row label="Carbs" color="var(--color-carbs)" per100={`${fmt(food.carbs, 1)}g`} portion={`${fmt(portion.carbs, 1)}g`} />
        <Row label="Fat" color="var(--color-fat)" per100={`${fmt(food.fat, 1)}g`} portion={`${fmt(portion.fat, 1)}g`} />
        {food.fibre != null && <Row label="Fibre" per100={`${fmt(food.fibre, 1)}g`} portion="" />}
        {food.sugar != null && <Row label="Sugar" per100={`${fmt(food.sugar, 1)}g`} portion="" />}
      </div>

      {/* Where your calories come from */}
      <div className="mt-3" role="img" aria-label={`Calories from protein ${Math.round(share.p * 100)} percent, carbs ${Math.round(share.c * 100)} percent, fat ${Math.round(share.f * 100)} percent`}>
        <div className="flex h-3 overflow-hidden rounded-sm bg-rule">
          {([['p', 'protein'], ['c', 'carbs'], ['f', 'fat']] as const).map(([k, name]) => (
            <div
              key={k}
              className="macro-fill h-full"
              style={{
                width: `${share[k] * 100}%`,
                background: `var(--color-${name})`,
                transform: `scaleX(${hasPortion ? 1 : 0})`,
              }}
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          Calories from protein {Math.round(share.p * 100)}% · carbs {Math.round(share.c * 100)}% · fat {Math.round(share.f * 100)}%
        </p>
      </div>

      <p className="mt-3 text-xs text-muted">
        {food.source_url ? (
          <>Source: <a className="underline hover:text-ultramarine" href={food.source_url} target="_blank" rel="noopener noreferrer">{food.source_name ?? food.source_url}</a></>
        ) : (
          <>Source: {food.source_name ?? 'not recorded'}</>
        )}
        {food.fetched_at && <> · updated {new Date(food.fetched_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</>}
      </p>
    </section>
  );
}
