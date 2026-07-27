'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';
import { brand } from '@brand';
import { ADMIN_THEMES, AdminThemeContext, type AdminThemeKey } from './admin-theme';

// ─── Ícones (SVG inline, leves) ───────────────────────────────────────────────
function Icon({ name }: { name: string }) {
  const p: Record<string, React.ReactNode> = {
    pedidos: <path d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm8 1v5h5M8 12h8M8 16h8M8 8h3" />,
    cardapio: <path d="M3 4h18M3 12h18M3 20h18" />,
    caixa: <path d="M3 7h18v12H3zM3 7l2-3h14l2 3M8 13h.01M16 13a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />,
    analise: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    feedback: <path d="m12 2 3 7 7 .5-5.5 4.5 2 7-6.5-4-6.5 4 2-7L2 9.5 9 9z" />,
    clientes: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87" />,
    cupons: <><path d="M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V7Z" /><path d="M9 7v14" strokeDasharray="2 2" /></>,
    banners: <path d="M3 5h18v14H3zM3 9h18M8 5v4" />,
    marketing: <path d="m3 11 18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6" />,
    definicoes: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 0-.2-1.8l2-1.5-2-3.4-2.3 1a8 8 0 0 0-3-1.8L14 .5h-4l-.5 2.2a8 8 0 0 0-3 1.8l-2.3-1-2 3.4 2 1.5A8 8 0 0 0 4 12c0 .6 0 1.2.2 1.8l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 3 1.8L10 23.5h4l.5-2.2a8 8 0 0 0 3-1.8l2.3 1 2-3.4-2-1.5c.2-.6.2-1.2.2-1.8Z" />,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {p[name]}
    </svg>
  );
}

const NAV = [
  { href: '/pedidos', label: 'Pedidos', icon: 'pedidos', badge: true },
  { href: '/cardapio', label: 'Catálogo', icon: 'cardapio' },
  { href: '/banners', label: 'Banners', icon: 'banners' },
  { href: '/caixa', label: 'Caixa', icon: 'caixa' },
  { href: '/analise', label: 'Análise', icon: 'analise' },
  { href: '/feedback', label: 'Avaliações', icon: 'feedback' },
  { href: '/lista-espera', label: 'Clientes', icon: 'clientes' },
  { href: '/cupons', label: 'Cupons', icon: 'cupons' },
  { href: '/marketing', label: 'Marketing', icon: 'marketing' },
  { href: '/definicoes', label: 'Definições', icon: 'definicoes' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [badge, setBadge] = useState<number | null>(null);
  const [storeOpen, setStoreOpen] = useState<boolean | null>(null);
  const [theme, setThemeState] = useState<AdminThemeKey>('red');

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      if (session.user.user_metadata?.role === 'kitchen') { router.replace('/'); return; }
      setUser(session.user);
      setLoading(false);
      // badge (pedidos ativos) + estado da loja + tema escolhido
      supabase.rpc('get_order_stats').then(({ data }) => {
        if (data) setBadge((data.ativos ?? 0) + (data.aguarda_pagamento ?? 0));
      });
      supabase.from('settings').select('accepting_orders, admin_theme').eq('id', 1).single()
        .then(({ data }) => {
          if (data) {
            setStoreOpen(data.accepting_orders);
            if (data.admin_theme in ADMIN_THEMES) setThemeState(data.admin_theme as AdminThemeKey);
          }
        });
    }
    checkAuth();
  }, [router, supabase]);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Troca instantânea (otimista) + persiste em settings.admin_theme.
  const setTheme = (next: AdminThemeKey) => {
    setThemeState(next);
    supabase.from('settings').update({ admin_theme: next }).eq('id', 1).then();
  };

  const themeVars = ADMIN_THEMES[theme].vars as React.CSSProperties;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080809] flex items-center justify-center">
        <div className="text-[#EA1D2C] text-lg font-semibold animate-pulse">A carregar painel…</div>
      </div>
    );
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const monogram = brand.name.trim()[0]?.toUpperCase() ?? '?';

  const Sidebar = (
    <aside className="flex h-full w-64 flex-col bg-[var(--adm-bg-2)] backdrop-blur-[12px] border-r border-[var(--adm-border)]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-[var(--adm-border)]">
        <span
          className="grid place-items-center w-8 h-8 rounded-lg text-white font-black"
          style={{ background: 'var(--adm-accent)', boxShadow: '0 0 16px var(--adm-accent-glow)' }}
        >
          {monogram}
        </span>
        <span className="font-bold text-[var(--adm-text)] tracking-tight truncate">{brand.name}</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all border-l-[3px]"
              style={active
                ? { background: 'color-mix(in srgb, var(--adm-accent) 12%, transparent)', color: 'var(--adm-accent)', borderColor: 'var(--adm-accent)' }
                : { borderColor: 'transparent', color: 'var(--adm-muted)' }}
            >
              <Icon name={item.icon} />
              <span className="flex-1">{item.label}</span>
              {item.badge && badge != null && badge > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 grid place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: 'var(--adm-accent)' }}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Rodapé: estado da loja */}
      <div className="border-t border-[var(--adm-border)] p-4 space-y-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--adm-faint)] mb-1">Status da loja</p>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${storeOpen ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`} />
            <span className={`text-sm font-medium ${storeOpen ? 'text-green-500' : 'text-red-500'}`}>
              {storeOpen == null ? '—' : storeOpen ? 'Loja aberta' : 'Loja fechada'}
            </span>
          </div>
        </div>
        <a href="/menu" target="_blank" rel="noopener noreferrer"
          className="block text-center text-sm font-semibold rounded-xl border border-[var(--adm-border)] py-2 text-[var(--adm-text)] hover:bg-[var(--adm-card)] transition-all">
          Ver loja
        </a>
      </div>
    </aside>
  );

  return (
    <AdminThemeContext.Provider value={{ theme, setTheme }}>
      <div className="relative min-h-screen bg-[var(--adm-bg)] text-[var(--adm-text)] flex" style={themeVars}>
        {/* brilho ambiente para o glassmorphism ter profundidade */}
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0"
          style={{ background: 'radial-gradient(60rem 40rem at 85% -10%, color-mix(in srgb, var(--adm-accent) 10%, transparent), transparent 60%), radial-gradient(50rem 40rem at -10% 110%, color-mix(in srgb, var(--adm-accent) 6%, transparent), transparent 55%)' }}
        />

        {/* Sidebar desktop */}
        <div className="hidden lg:block fixed inset-y-0 left-0 z-30">{Sidebar}</div>

        {/* Drawer mobile */}
        {drawerOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => setDrawerOpen(false)} />
            <div className="relative h-full">{Sidebar}</div>
          </div>
        )}

        {/* Conteúdo */}
        <div className="relative z-10 flex-1 lg:ml-64 min-w-0">
          {/* Topbar */}
          <header className="sticky top-0 z-20 h-16 bg-[var(--adm-bg-2)] backdrop-blur-[12px] border-b border-[var(--adm-border)] flex items-center gap-3 px-4 lg:px-6">
            <button onClick={() => setDrawerOpen(true)} className="lg:hidden text-[var(--adm-muted)] hover:text-[var(--adm-text)]" aria-label="Menu">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            </button>
            <div className="flex-1 max-w-md hidden sm:block">
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 backdrop-blur-[8px] border border-[var(--adm-border)]" style={{ background: 'color-mix(in srgb, var(--adm-text) 4%, transparent)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--adm-faint)" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
                <input placeholder="Buscar pedido, cliente…" className="bg-transparent text-sm text-[var(--adm-text)] placeholder:text-[var(--adm-faint)] focus:outline-none w-full" />
                <kbd className="hidden md:inline-flex items-center gap-0.5 rounded-md border border-[var(--adm-border-strong)] px-1.5 text-[10px] text-[var(--adm-faint)]">⌘K</kbd>
              </div>
            </div>
            <div className="flex-1 sm:hidden" />
            <button className="relative grid place-items-center w-9 h-9 rounded-xl border border-[var(--adm-border)] text-[var(--adm-muted)] hover:text-[var(--adm-text)] hover:bg-[var(--adm-card)] transition-all" aria-label="Notificações">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-[var(--adm-border)]">
              <div className="w-8 h-8 rounded-full grid place-items-center text-sm font-bold" style={{ background: 'color-mix(in srgb, var(--adm-accent) 20%, transparent)', color: 'var(--adm-accent)' }}>
                {user?.email?.[0]?.toUpperCase() ?? 'A'}
              </div>
              <div className="hidden md:block leading-tight">
                <p className="text-sm font-medium text-[var(--adm-text)] truncate max-w-[160px]">{user?.email}</p>
                <p className="text-[11px] text-[var(--adm-faint)]">Administrador</p>
              </div>
              <button onClick={signOut} className="ml-1 text-sm text-[var(--adm-muted)] hover:text-[var(--adm-accent)] transition-colors">Sair</button>
            </div>
          </header>

          <main className="p-4 lg:p-6 max-w-[1400px] mx-auto">{children}</main>
        </div>
      </div>
    </AdminThemeContext.Provider>
  );
}
