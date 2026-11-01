/**
 * JS fuzzy search used by the local-dev fallback. Production uses Postgres
 * pg_trgm (search_foods RPC); this mirrors its behaviour closely enough for dev.
 */
import type { Food } from './types.ts';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of norm(s).split(' ')) {
    if (!word) continue;
    const p = `  ${word} `;
    for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

export function similarity(a: string, b: string): number {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function scoreFood(f: Food & { aliases?: string[] }, query: string): number {
  const q = norm(query);
  if (!q) return 0;
  const text = norm([f.brand, f.name, f.variant].filter(Boolean).join(' '));
  let s = similarity(text, q);
  if (text.includes(q)) s = Math.max(s, 0.6);
  // word-prefix match: "pan" -> "paneer", "milkymist" -> "milky mist"
  const squashed = text.replace(/ /g, '');
  if (q.length >= 3 && squashed.includes(q.replace(/ /g, ''))) s = Math.max(s, 0.6);
  for (const a of f.aliases ?? []) {
    const al = norm(a);
    s = Math.max(s, similarity(al, q));
    if (al.startsWith(q) || (q.length >= 3 && al.replace(/ /g, '').startsWith(q.replace(/ /g, '')))) s = Math.max(s, 0.7);
  }
  return s;
}

export function searchLocal<T extends Food & { aliases?: string[] }>(foods: T[], query: string, limit = 8): T[] {
  return foods
    .map((f) => ({ f, s: scoreFood(f, query) }))
    .filter((x) => x.s >= 0.32)
    .sort((a, b) => {
      // generic first, but only when it is a solid match
      const ga = a.f.is_generic && a.s >= 0.45 ? 1 : 0;
      const gb = b.f.is_generic && b.s >= 0.45 ? 1 : 0;
      return gb - ga || b.s - a.s || b.f.search_count - a.f.search_count;
    })
    .slice(0, limit)
    .map((x) => x.f);
}
