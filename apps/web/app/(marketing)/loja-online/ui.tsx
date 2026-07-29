'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Revela o bloco quando entra no ecrã (sem libs). Respeita prefers-reduced-motion via CSS. */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add('is-in');
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`lp-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Barra de ação fixa no fundo (mobile) — aparece depois do hero. */
export function StickyCta({ href, price }: { href: string; price: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 640);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t p-3 backdrop-blur-xl transition-transform duration-300 md:hidden"
      style={{
        borderColor: 'var(--lp-line)',
        background: 'rgba(8,7,10,.86)',
        transform: show ? 'translateY(0)' : 'translateY(110%)',
        paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--lp-mute)' }}>
            Implementação completa
          </p>
          <p className="text-lg font-bold leading-tight" style={{ color: 'var(--lp-ink)' }}>
            {price}
          </p>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 cursor-pointer rounded-xl px-5 py-3 text-sm font-bold text-black transition-transform duration-200 active:scale-95"
          style={{ background: 'linear-gradient(135deg,#f6d488 0%,#e5a93c 100%)' }}
        >
          Falar no WhatsApp
        </a>
      </div>
    </div>
  );
}

/** Conta até ao valor quando entra no ecrã. */
export function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(to);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min((t - start) / 1100, 1);
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [to]);

  return (
    <span ref={ref}>
      {n}
      {suffix}
    </span>
  );
}
