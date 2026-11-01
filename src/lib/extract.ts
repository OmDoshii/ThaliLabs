/**
 * Pure helpers for the lookup pipeline (no network, no Cloudflare imports),
 * so they can be unit-tested in plain Node.
 */
import { nameMatchScore } from './checks.ts';

const BLOCKED_HOSTS = [
  'youtube.com', 'youtu.be', 'instagram.com', 'facebook.com', 'pinterest.', 'reddit.com',
  'quora.com', 'twitter.com', 'x.com', 'tiktok.com', 'linkedin.com', 'wikipedia.org',
];

export function safePublicUrl(u: string): boolean {
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:') return false;
    const h = x.hostname.toLowerCase();
    if (h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || !h.includes('.')) return false;
    if (BLOCKED_HOSTS.some((b) => h === b || h.endsWith('.' + b) || (b.endsWith('.') && h.includes(b)))) return false;
    return true;
  } catch { return false; }
}

export interface Hit { title?: string; link: string; snippet?: string }

/** Title + snippet + the URL path words. Many sites have useless titles ("Food database") but a descriptive URL. */
export function hitText(h: Hit): string {
  let path = '';
  try { path = new URL(h.link).pathname.replace(/[-_/+.]|%20/g, ' '); } catch {}
  return `${h.title ?? ''} ${h.snippet ?? ''} ${path}`;
}

/** Keep hits that look like they are about the searched product, best first. */
export function rankHits(query: string, hits: Hit[], max = 4, minScore = 0.6): (Hit & { score: number })[] {
  return hits
    .filter((h) => h?.link && safePublicUrl(h.link))
    .map((h) => ({ ...h, score: nameMatchScore(query, hitText(h)) }))
    .filter((h) => h.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

/**
 * Turn raw HTML into the part of the page worth sending to the model:
 * any JSON-LD nutrition blocks first, then windows of text around "protein / energy / kcal".
 */
export function relevantText(html: string, cap = 9000): string {
  html = html.slice(0, 700_000); // keep CPU time bounded on Workers

  const ld: string[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (/nutrition|calories|proteinContent|fatContent/i.test(m[1])) ld.push(m[1].replace(/\s+/g, ' ').slice(0, 2500));
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

  const windows: [number, number][] = [];
  for (const m of text.matchAll(/protein|energy|calories|kcal|carbohydrate/gi)) {
    const i = m.index ?? 0;
    const w: [number, number] = [Math.max(0, i - 600), Math.min(text.length, i + 900)];
    const last = windows[windows.length - 1];
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]); else windows.push(w);
    if (windows.length >= 4) break;
  }
  const body = windows.length ? windows.map(([a, b]) => text.slice(a, b)).join(' ... ') : text.slice(0, 6000);
  return [...ld, body].join('\n').slice(0, cap);
}

export const looksNutritional = (t: string) => /protein/i.test(t) && /(energy|calori|kcal|fat)/i.test(t);

/**
 * Anti-hallucination check: numbers the model reports must really appear in the
 * source text. Requires at least `min` of the given values to be found.
 */
export function valuesAppearIn(text: string, values: number[], min = 3): boolean {
  const found = values.filter((v) => {
    if (!Number.isFinite(v)) return false;
    const s = String(Math.round(v * 100) / 100).replace('.', '\\.');
    return new RegExp(`(?<![\\d.])${s}(?:\\.0+)?(?![\\d])`).test(text);
  }).length;
  return found >= min;
}

/** Sanity bounds for per-100g values. */
export function plausible(v: { kcal: number; protein: number; carbs: number; fat: number }): boolean {
  return v.kcal >= 0 && v.kcal <= 950 && [v.protein, v.carbs, v.fat].every((n) => n >= 0 && n <= 100);
}
