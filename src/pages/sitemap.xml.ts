import type { APIRoute } from 'astro';
import { listFoods } from '../lib/db.ts';

export const prerender = false;

export const GET: APIRoute = async ({ locals, site, url }) => {
  const base = (site ?? url).origin;
  const foods = (await listFoods(locals, { limit: 5000 })).filter((f) => f.status !== 'flagged');
  const urls = [`${base}/`, `${base}/nutrition`, ...foods.map((f) => `${base}/nutrition/${f.slug}`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n') + `\n</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' } });
};
