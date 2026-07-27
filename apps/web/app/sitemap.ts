import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '../lib/site-url';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = resolveSiteUrl().toString().replace(/\/$/, '');

  const routes = ['/', '/menu', '/termos', '/privacidade', '/trocas-devolucoes'];

  return routes.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '/menu' ? 'hourly' : 'monthly',
    priority: path === '/menu' ? 1 : 0.5,
  }));
}
