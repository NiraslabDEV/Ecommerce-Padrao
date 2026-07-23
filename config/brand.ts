/**
 * Identidade whitelabel da LOJA (ecommerce).
 * Para cada cliente novo: editar este ficheiro + .env + assets em /public/assets.
 * NUNCA espalhar identidade de marca pelo código — tudo aqui.
 *
 * Este é o brand DEMO do Ecommerce-Padrão (boutique de moda & perfumaria).
 */

export const brand = {
  name: 'LUMA',
  tagline: 'Moda & Perfumaria',
  locale: 'pt-MZ' as const,
  currency: 'MZN' as const,

  // Redes sociais (opcional — deixar '' esconde o ícone)
  social: {
    instagram: '',
    facebook: '',
    whatsapp: '',
  },

  // Tema do PAINEL (admin) — tokens CSS mapeados para Tailwind via globals.css.
  // Mantido escuro/neutro; a loja pública usa o bloco `storefront` abaixo.
  theme: {
    gold: '#b08d57',
    goldDeep: '#8a6d3f',
    ember: '#c98a5e',
    bg0: '#0c0c0d',
    bg1: '#141416',
    bg2: '#1c1c1f',
    bg3: '#242428',
    ink: '#f4f2ee',
    inkDim: '#c7c3bb',
    inkMute: '#847e72',
    fontDisplay: "'Playfair Display', 'Georgia', serif",
    fontBody: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
    radiusSm: '6px',
    radiusMd: '10px',
    radiusLg: '18px',
  },

  // ── Loja do cliente (storefront) — whitelabel via CSS vars ────────────────────
  // Registro visual de ecommerce de moda: claro, elegante, muito respiro.
  // Os componentes leem var(--st-*) injetadas em apps/web/app/(public)/layout.tsx.
  storefront: {
    logoText: 'LUMA',
    bg: '#ffffff',
    card: '#ffffff',
    line: 'rgba(20,20,20,0.10)',
    primary: '#141414',
    primary2: '#b08d57',
    grad: 'linear-gradient(135deg,#141414 0%,#3a3a3a 100%)',
    star: '#b08d57',
    text: '#141414',
    muted: '#8a8a8a',
    muted2: '#5c5c5c',
    font: "'Plus Jakarta Sans', sans-serif",
    hero: {
      image: '/assets/luma/hero.png',
      title: 'Nova Coleção',
      subtitle: 'Peças e fragrâncias selecionadas para a estação.',
      cta: 'Ver Coleção',
    },
    // fotos de fallback quando um produto não tem photo_url
    fallbackImages: [
      '/assets/luma/00.png', '/assets/luma/01.png', '/assets/luma/02.png',
      '/assets/luma/03.png', '/assets/luma/04.png', '/assets/luma/05.png',
    ],
  },
} as const;

export type Brand = typeof brand;
