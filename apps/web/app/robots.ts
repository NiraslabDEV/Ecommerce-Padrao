import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '../lib/site-url';

export default function robots(): MetadataRoute.Robots {
  const base = resolveSiteUrl().toString().replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/pedidos', '/caixa', '/analise', '/cardapio', '/definicoes', '/feedback', '/lista-espera', '/marketing', '/login'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
