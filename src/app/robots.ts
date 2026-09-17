import type { MetadataRoute } from 'next';
import { isPublicSite } from '@/lib/beta';

/**
 * The dev build must never show up in search results next to the real site.
 * Indexing is opt-IN: only a deployment that says it is the public one
 * (GIGI_SITE_ENV=production) is crawlable.
 *
 * This is what keeps an ungated dev deployment out of search, so it does not
 * depend on the beta gate and must not start to.
 *
 * `force-dynamic` because this reads an environment variable. Next prerenders
 * robots.txt at BUILD time by default, which bakes in whatever GIGI_SITE_ENV
 * happened to be visible to the builder — so the public site would keep serving
 * `Disallow: /` until someone rebuilt it, and the launch would simply never be
 * indexed. Evaluating per request costs nothing here and removes a failure that
 * is invisible from the outside until you notice GiGi is not in Google.
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: isPublicSite() ? { userAgent: '*', allow: '/' } : { userAgent: '*', disallow: '/' },
  };
}
