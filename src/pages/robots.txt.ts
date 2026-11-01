import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ site, url }) =>
  new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${(site ?? url).origin}/sitemap.xml\n`, {
    headers: { 'Content-Type': 'text/plain' },
  });
