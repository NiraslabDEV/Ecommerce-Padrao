/**
 * Identidade whitelabel do restaurante.
 * Para cada cliente novo: editar este ficheiro + .env + assets em /public/assets.
 * NUNCA espalhar identidade de marca pelo código — tudo aqui.
 */

export const brand = {
  name: 'THE BOX',
  tagline: 'Sabores que viciam',
  locale: 'pt-MZ' as const,
  currency: 'MZN' as const,

  // Redes sociais (opcional)
  social: {
    instagram: '',
    facebook: '',
    whatsapp: '',
  },

  // Tema — tokens CSS mapeados para Tailwind via globals.css
  // Editar para mudar cores do cliente (overrides os defaults HawSmash)
  theme: {
    gold: '#e5a93c',
    goldDeep: '#c48a1e',
    ember: '#e85a2a',
    bg0: '#0a0807',
    bg1: '#111110',
    bg2: '#1a1816',
    bg3: '#221f1c',
    ink: '#f6f1e6',
    inkDim: '#c8bfb0',
    inkMute: '#847e72',
    fontDisplay: "'Bebas Neue', 'Anton', Impact, sans-serif",
    fontBody: "'DM Sans', 'Inter', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
    radiusSm: '6px',
    radiusMd: '10px',
    radiusLg: '18px',
  },

  // ── Loja do cliente (storefront "The Box") — whitelabel via CSS vars ──────────
  // Editar isto (+ assets em public/assets/<brand>/) troca a loja inteira de empresa.
  // Os componentes leem var(--st-*) injetadas em apps/web/app/(public)/layout.tsx.
  storefront: {
    logoText: 'THE BOX',
    bg: '#0d0d0d',
    card: '#1a1a1a',
    line: 'rgba(255,255,255,0.09)',
    primary: '#e8174d',
    primary2: '#ff5f30',
    grad: 'linear-gradient(135deg,#e8174d 0%,#ff5f30 100%)',
    star: '#f59e0b',
    text: '#ffffff',
    muted: '#888888',
    muted2: '#bbbbbb',
    font: "'Plus Jakarta Sans', sans-serif",
    hero: {
      image: '/assets/thebox/hero.png',
      title: 'SABORES QUE VICIAM!',
      subtitle: 'Comida de verdade, feita para matar a fome!',
      cta: 'PEDIR AGORA',
    },
    // fotos de fallback quando um item do cardápio não tem photo_url
    fallbackImages: [
      '/assets/thebox/00.png', '/assets/thebox/img1.png', '/assets/thebox/2.png',
      '/assets/thebox/3.png', '/assets/thebox/4.png', '/assets/thebox/5.png',
      '/assets/thebox/6.png', '/assets/thebox/7.png', '/assets/thebox/8.png',
      '/assets/thebox/9.png', '/assets/thebox/11.png', '/assets/thebox/12.png',
    ],
  },
} as const;

export type Brand = typeof brand;
