// Base URL pública robusta: a env pode vir SEM esquema (ex.: Railway dá "host.up.railway.app").
// new URL() exige protocolo — prefixamos https:// e caímos em localhost se for inválida.
export function resolveSiteUrl(): URL {
  const raw = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || '').trim();
  const candidate = raw ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : 'http://localhost:3000';
  try {
    return new URL(candidate);
  } catch {
    return new URL('http://localhost:3000');
  }
}
