import type { ReactNode } from 'react';

/**
 * Área de MARKETING (venda do produto Niraslab) — NÃO faz parte da loja do cliente.
 *
 * Ao clonar o repo para um cliente novo: apagar a pasta `app/(marketing)/` inteira.
 * Nada no resto da app depende dela.
 *
 * Tema próprio (escuro/dourado), independente dos tokens --st-* da loja.
 */

const css = `
.lp { --lp-gold:#e5a93c; --lp-gold-2:#f6d488; --lp-ember:#e85a2a;
      --lp-bg:#08070a; --lp-bg-2:#0f0d12; --lp-card:rgba(255,255,255,.035);
      --lp-line:rgba(255,255,255,.09); --lp-line-2:rgba(255,255,255,.16);
      --lp-ink:#f7f3ea; --lp-dim:#b9b2a5; --lp-mute:#8b8477; }

.lp-reveal { opacity:0; transform:translateY(26px);
  transition:opacity .75s cubic-bezier(.16,1,.3,1), transform .75s cubic-bezier(.16,1,.3,1); }
.lp-reveal.is-in { opacity:1; transform:none; }

/* Aurora dourada de fundo — puro CSS, sem libs */
.lp-aurora::before, .lp-aurora::after {
  content:""; position:absolute; border-radius:9999px; pointer-events:none;
  filter:blur(90px); opacity:.5;
}
.lp-aurora::before { width:min(70vw,720px); aspect-ratio:1; top:-22%; right:-14%;
  background:radial-gradient(circle,rgba(229,169,60,.42) 0%,transparent 68%); }
.lp-aurora::after  { width:min(60vw,560px); aspect-ratio:1; bottom:-24%; left:-16%;
  background:radial-gradient(circle,rgba(232,90,42,.30) 0%,transparent 68%); }

/* Grelha técnica muito ténue */
.lp-grid { background-image:
  linear-gradient(rgba(255,255,255,.028) 1px,transparent 1px),
  linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px);
  background-size:64px 64px; }

/* Título com brilho dourado a atravessar */
.lp-shine { background:linear-gradient(100deg,#f7f3ea 12%,var(--lp-gold-2) 38%,var(--lp-gold) 52%,#f7f3ea 78%);
  background-size:220% 100%; -webkit-background-clip:text; background-clip:text; color:transparent;
  animation:lp-shine 7s ease-in-out infinite; }
@keyframes lp-shine { 0%,100%{background-position:0% 0} 50%{background-position:100% 0} }

.lp-pulse { animation:lp-pulse 2.6s ease-in-out infinite; }
@keyframes lp-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(229,169,60,.42)} 60%{box-shadow:0 0 0 14px rgba(229,169,60,0)} }

/* Marquee da faixa de garantias */
.lp-marquee { animation:lp-marquee 34s linear infinite; }
@keyframes lp-marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }

/* FAQ nativo <details> */
.lp-faq summary::-webkit-details-marker { display:none; }
.lp-faq summary { list-style:none; }
.lp-faq[open] .lp-chev { transform:rotate(45deg); }

@media (prefers-reduced-motion: reduce) {
  .lp-reveal { opacity:1; transform:none; transition:none; }
  .lp-shine, .lp-pulse, .lp-marquee { animation:none; }
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
