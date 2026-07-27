import { ImageResponse } from 'next/og';
import { brand } from '@brand';

// Favicon whitelabel: monograma da marca sobre o gradiente da loja.
// Gerado em runtime a partir de config/brand.ts — nada de asset fixo por cliente.
// runtime 'edge' evita um bug do @vercel/og (variante node) que quebra o build
// local no Windows ao resolver a fonte default via fileURLToPath.
export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  const letter = brand.name.trim()[0]?.toUpperCase() ?? '?';
  const s = brand.storefront;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${s.primary} 0%, ${s.primary2} 100%)`,
          color: '#fff',
          fontSize: 20,
          fontWeight: 700,
        }}
      >
        {letter}
      </div>
    ),
    { ...size }
  );
}
