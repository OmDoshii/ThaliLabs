// Lets plain Node import server modules that use Cloudflare's virtual "cloudflare:workers" module.
export async function resolve(spec, ctx, next) {
  if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = {};', shortCircuit: true };
  return next(spec, ctx);
}
