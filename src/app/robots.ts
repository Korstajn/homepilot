import type { MetadataRoute } from 'next';

/**
 * dev.getgigiapp.com must never show up in search results next to the real
 * site. Indexing is opt-IN: only a deployment that says it is the public one
 * (GIGI_SITE_ENV=production) is crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  const isPublicSite = process.env.GIGI_SITE_ENV?.trim().toLowerCase() === 'production';
  return {
    rules: isPublicSite ? { userAgent: '*', allow: '/' } : { userAgent: '*', disallow: '/' },
  };
}
