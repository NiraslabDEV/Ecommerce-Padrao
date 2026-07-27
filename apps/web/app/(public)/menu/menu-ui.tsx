'use client';

import { useEffect, useState } from 'react';

// ── Imagem robusta a assets ausentes ─────────────────────────────────────────
// Os assets do brand demo (/assets/luma/*) ainda não existem e os produtos vêm
// com photo_url = null. Quando não há imagem (ou ela falha a carregar) mostramos
// um fundo com var(--st-grad) + monograma elegante — nunca uma imagem partida.
// Usar dentro de um contentor `position: relative` (preenche-o via inset-0).
export function SmartImage({
  src,
  alt,
  monogram,
  rounded,
  className = '',
  fit = 'cover',
}: {
  src?: string | null;
  alt: string;
  monogram?: string;
  rounded?: string;
  className?: string;
  // 'contain': mostra a foto inteira sem cortar (letterbox no fundo do
  // contentor). Necessário quando o sujeito da foto não está centrado no
  // enquadramento original — nesse caso NENHUM ponto de ancoragem de um
  // crop "cover" resolve o "fora de centro", só não cortar resolve.
  fit?: 'cover' | 'contain';
}) {
  const [failed, setFailed] = useState(false);

  // Reset ao trocar de imagem — sem isto, uma falha antiga "prende" o componente
  // no fallback mesmo depois de `src` mudar para uma foto válida (ex.: navegar
  // entre produtos relacionados dentro do mesmo card/instância montada).
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImg = Boolean(src) && !failed;

  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={src}
        src={src as string}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`absolute inset-0 h-full w-full ${rounded ?? ''} ${className}`}
        style={{ objectFit: fit }}
      />
    );
  }

  const letter = (monogram ?? alt ?? '').trim()[0]?.toUpperCase() ?? '';
  return (
    <div
      aria-hidden
      className={`absolute inset-0 flex items-center justify-center overflow-hidden ${rounded ?? ''} ${className}`}
      style={{ background: 'var(--st-grad)' }}
    >
      {/* brilho suave para dar profundidade ao gradiente */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 90% at 20% 0%, rgba(255,255,255,0.16) 0%, transparent 55%)' }}
      />
      {letter && (
        <span
          className="relative font-semibold tracking-[0.08em] select-none"
          style={{ color: 'rgba(255,255,255,0.82)', fontSize: 'clamp(1.4rem, 6vw, 2.6rem)' }}
        >
          {letter}
        </span>
      )}
    </div>
  );
}

// ── Deteção de cores em nomes de variante (swatches vs pills) ────────────────
const stripAccents = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

// PT + EN. Chave normalizada (sem acentos) → hex.
const COLOR_MAP: Record<string, string> = {
  preto: '#111111', black: '#111111',
  branco: '#ffffff', white: '#ffffff',
  'off-white': '#f5f2ec', offwhite: '#f5f2ec', cru: '#f5f2ec',
  vermelho: '#c0392b', red: '#c0392b',
  azul: '#2c5aa0', blue: '#2c5aa0',
  marinho: '#1f2a44', navy: '#1f2a44', 'azul-marinho': '#1f2a44',
  verde: '#2e7d32', green: '#2e7d32',
  amarelo: '#f1c40f', yellow: '#f1c40f',
  laranja: '#e67e22', orange: '#e67e22',
  rosa: '#e75aa0', pink: '#e75aa0',
  roxo: '#7b3fa0', violeta: '#7b3fa0', purple: '#7b3fa0', lilas: '#b57edc', lavanda: '#b57edc',
  cinza: '#808080', cinzento: '#808080', gray: '#808080', grey: '#808080', grafite: '#3a3a3a',
  castanho: '#6f4e37', marrom: '#6f4e37', brown: '#6f4e37',
  bege: '#d9c7a3', beige: '#d9c7a3', nude: '#e3bc9a', creme: '#f0e6d2', cream: '#f0e6d2',
  dourado: '#b08d57', ouro: '#b08d57', gold: '#b08d57',
  prata: '#c0c0c0', prateado: '#c0c0c0', silver: '#c0c0c0',
  bordo: '#6d1a2e', vinho: '#6d1a2e', wine: '#6d1a2e', burgundy: '#6d1a2e', bordeaux: '#6d1a2e',
  caqui: '#b5a642', khaki: '#b5a642', militar: '#4b5320',
  turquesa: '#1abc9c', turquoise: '#1abc9c', coral: '#ff6f61',
  mostarda: '#d4a017', mustard: '#d4a017',
  terracota: '#b5643c', terracotta: '#b5643c',
};

// Devolve o hex se o nome "parecer" uma cor, senão null.
export function colorForName(name: string): string | null {
  const n = stripAccents(name);
  if (COLOR_MAP[n]) return COLOR_MAP[n];
  // procura por palavra contida (ex.: "Azul Marinho", "Verde Militar")
  for (const key of Object.keys(COLOR_MAP)) {
    const re = new RegExp(`(^|[^a-z])${key.replace('-', '[- ]?')}([^a-z]|$)`);
    if (re.test(n)) return COLOR_MAP[key];
  }
  return null;
}

// A maioria das variantes parece cor? → mostra swatches de cor; senão pills.
export function variantsLookLikeColors(names: string[]): boolean {
  const clean = names.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return false;
  const hits = clean.filter((n) => colorForName(n)).length;
  return hits > 0 && hits >= Math.ceil(clean.length / 2);
}

// Cor muito clara → precisa de borda para se ver no fundo branco.
export function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.82;
}
