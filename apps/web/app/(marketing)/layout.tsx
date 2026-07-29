import type { ReactNode } from 'react';

/**
 * Área de MARKETING (venda do produto Niraslab) — NÃO faz parte da loja do cliente.
 *
 * Ao clonar o repo para um cliente novo: apagar a pasta `app/(marketing)/` inteira.
 * Nada no resto da app depende dela.
 *
 * Tema próprio CLARO (branco + azul oceano), independente dos tokens --st-* da loja
 * e do tema escuro do painel admin.
 */

const css = `
.lp {
  /* Superfícies */
  --lp-bg:#ffffff;
  --lp-bg-2:#f2f8fd;          /* lavagem oceânica muito suave */
  --lp-bg-3:#e7f2fa;
  --lp-card:#ffffff;

  /* Traço */
  --lp-line:rgba(7,42,63,.10);
  --lp-line-2:rgba(7,42,63,.17);

  /* Texto (todos ≥ 4.5:1 sobre branco) */
  --lp-ink:#072a3f;           /* títulos — azul-marinho profundo */
  --lp-dim:#3d5a6c;           /* corpo */
  --lp-mute:#5b7789;          /* legendas */

  /* Azul oceano */
  --lp-blue:#0284c7;          /* ícones, números grandes */
  --lp-blue-deep:#0369a1;     /* texto pequeno, links */
  --lp-blue-bright:#0ea5e9;   /* gradientes, brilhos */
  --lp-aqua:#06b6d4;          /* acento água */
  --lp-grad:linear-gradient(135deg,#0369a1 0%,#075985 100%);

  /* Acento quente (só na secção do problema) */
  --lp-coral:#d9531f;
  --lp-coral-soft:rgba(249,115,22,.10);

  /* Sombras tingidas de azul — não pretas */
  --lp-sh-1:0 1px 2px rgba(7,42,63,.05), 0 10px 26px -18px rgba(7,42,63,.32);
  --lp-sh-2:0 2px 6px rgba(7,42,63,.05), 0 22px 48px -26px rgba(3,105,161,.42);
  --lp-sh-cta:0 10px 26px -10px rgba(2,132,199,.55);
}

.lp-reveal { opacity:0; transform:translateY(26px);
  transition:opacity .75s cubic-bezier(.16,1,.3,1), transform .75s cubic-bezier(.16,1,.3,1); }
.lp-reveal.is-in { opacity:1; transform:none; }

/* Mesh gradient de fundo — blobs oceânicos desfocados */
.lp-aurora::before, .lp-aurora::after {
  content:""; position:absolute; border-radius:9999px; pointer-events:none;
  filter:blur(90px);
}
.lp-aurora::before { width:min(72vw,760px); aspect-ratio:1; top:-26%; right:-12%;
  background:radial-gradient(circle,rgba(14,165,233,.30) 0%,transparent 68%); }
.lp-aurora::after  { width:min(62vw,600px); aspect-ratio:1; bottom:-28%; left:-14%;
  background:radial-gradient(circle,rgba(6,182,212,.24) 0%,transparent 68%); }

/* Grelha técnica muito ténue */
.lp-grid { background-image:
  linear-gradient(rgba(7,42,63,.045) 1px,transparent 1px),
  linear-gradient(90deg,rgba(7,42,63,.045) 1px,transparent 1px);
  background-size:64px 64px;
  -webkit-mask-image:radial-gradient(ellipse 80% 60% at 50% 30%,#000 40%,transparent 100%);
  mask-image:radial-gradient(ellipse 80% 60% at 50% 30%,#000 40%,transparent 100%); }

/* Título com corrente de azul a atravessar */
.lp-shine { background:linear-gradient(100deg,#0ea5e9 8%,#06b6d4 34%,#0369a1 58%,#0ea5e9 86%);
  background-size:220% 100%; -webkit-background-clip:text; background-clip:text; color:transparent;
  animation:lp-shine 7s ease-in-out infinite; }
@keyframes lp-shine { 0%,100%{background-position:0% 0} 50%{background-position:100% 0} }

.lp-pulse { animation:lp-pulse 2.6s ease-in-out infinite; }
@keyframes lp-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(2,132,199,.45)} 60%{box-shadow:0 0 0 14px rgba(2,132,199,0)} }

/* Faixa de garantias */
.lp-marquee { animation:lp-marquee 34s linear infinite; }
@keyframes lp-marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }

/* Cartões: elevação suave ao passar o rato */
.lp-card { background:var(--lp-card); border:1px solid var(--lp-line); box-shadow:var(--lp-sh-1);
  transition:box-shadow .24s ease, border-color .24s ease, transform .24s ease; }
.lp-card:hover { border-color:rgba(2,132,199,.34); box-shadow:var(--lp-sh-2); }

/* FAQ nativo <details> */
.lp-faq summary::-webkit-details-marker { display:none; }
.lp-faq summary { list-style:none; }
.lp-faq[open] .lp-chev { transform:rotate(45deg); }

@media (prefers-reduced-motion: reduce) {
  .lp-reveal { opacity:1; transform:none; transition:none; }
  .lp-shine, .lp-pulse, .lp-marquee { animation:none; }
  .lp-card { transition:none; }
}
`;

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {children}
    </>
  );
}
