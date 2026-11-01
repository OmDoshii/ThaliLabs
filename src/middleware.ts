import { defineMiddleware } from 'astro:middleware';
import { getEnv } from './lib/env.ts';
import { COOKIE, verifySession } from './lib/auth.ts';

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  const isAdminArea = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  const isPublicAdmin = pathname === '/admin/login' || pathname === '/api/admin/login';

  if (isAdminArea && !isPublicAdmin) {
    const ok = await verifySession(getEnv(ctx.locals), ctx.cookies.get(COOKIE)?.value);
    if (!ok) {
      return pathname.startsWith('/api/')
        ? new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
        : ctx.redirect('/admin/login');
    }
  }

  const res = await next();
  // basic hardening headers on every response
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-Frame-Options', 'DENY');
  if (isAdminArea) {
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return res;
});
