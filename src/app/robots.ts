import type { MetadataRoute } from 'next';
import { isPublicSite } from '@/lib/beta';

/**
 * The dev build must never show up in search results next to the real site.
 * Indexing is opt-IN: only a deployment that says it is the public one
 * (GIGI_SITE_ENV=production) is crawlable.
 *
 * This is what keeps an ungated dev deployment out of search, so it does not
 * depend on the beta gate and must not start to.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: isPublicSite() ? { userAgent: '*', allow: '/' } : { userAgent: '*', disallow: '/' },
  };
}
