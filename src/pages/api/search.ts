import type { APIRoute } from 'astro';
import { searchFoods } from '../../lib/db.ts';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 2) return json({ results: [] });
  try {
    const results = await searchFoods(locals, q, 8);
    return json({ results }, { 'Cache-Control': 'public, max-age=60' });
  } catch (e) {
    console.error(e); return json({ results: [], error: 'search_failed' }, {}, 500);
  }
};

function json(body: unknown, headers: Record<string, string> = {}, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
