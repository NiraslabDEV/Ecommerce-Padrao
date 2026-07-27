'use client';

import { createContext, useContext } from 'react';

// 3 combinacoes prontas para o painel admin (settings.admin_theme, ver
// migration 20260723000001). O dono troca em poucos cliques em
// Definicoes -> Aparencia, sem precisar de redeploy. Aplicado via CSS vars
// --adm-* no wrapper de (admin)/layout.tsx (mesmo padrao dos --st-* da loja).
export type AdminThemeKey = 'red' | 'gold' | 'light';

export interface AdminThemeDef {
  label: string;
  description: string;
  /** [fundo, destaque] usados no swatch de preview do seletor */
  swatch: [string, string];
  vars: Record<string, string>;
}

export const ADMIN_THEMES: Record<AdminThemeKey, AdminThemeDef> = {
  red: {
    label: 'Clássico',
    description: 'Vermelho sobre escuro — o visual original do painel.',
    swatch: ['#0d0d0f', '#EA1D2C'],
    vars: {
      '--adm-bg': '#080809',
      '--adm-bg-2': 'rgba(255,255,255,0.03)',
      '--adm-card': 'rgba(255,255,255,0.03)',
      '--adm-accent': '#EA1D2C',
      '--adm-accent-glow': 'rgba(234,29,44,0.4)',
      '--adm-text': '#e8e8ea',
      '--adm-muted': '#A8A8B0',
      '--adm-faint': '#6F6F78',
      '--adm-border': 'rgba(255,255,255,0.08)',
      '--adm-border-strong': 'rgba(255,255,255,0.16)',
    },
  },
  gold: {
    label: 'Boutique',
    description: 'Dourado sobre escuro — elegante, para moda e perfumaria.',
    swatch: ['#0a0807', '#e5a93c'],
    vars: {
      '--adm-bg': '#0a0807',
      '--adm-bg-2': 'rgba(255,255,255,0.04)',
      '--adm-card': 'rgba(255,255,255,0.04)',
      '--adm-accent': '#e5a93c',
      '--adm-accent-glow': 'rgba(229,169,60,0.4)',
      '--adm-text': '#f6f1e6',
      '--adm-muted': '#c8bfb0',
      '--adm-faint': '#847e72',
      '--adm-border': 'rgba(255,255,255,0.08)',
      '--adm-border-strong': 'rgba(255,255,255,0.16)',
    },
  },
  light: {
    label: 'Claro',
    description: 'Minimalista e claro — espelha o visual da loja.',
    swatch: ['#f7f6f4', '#141414'],
    vars: {
      '--adm-bg': '#f7f6f4',
      '--adm-bg-2': '#ffffff',
      '--adm-card': '#ffffff',
      '--adm-accent': '#141414',
      '--adm-accent-glow': 'rgba(20,20,20,0.18)',
      '--adm-text': '#141414',
      '--adm-muted': '#6b6b6b',
      '--adm-faint': '#9a9a9a',
      '--adm-border': 'rgba(0,0,0,0.08)',
      '--adm-border-strong': 'rgba(0,0,0,0.16)',
    },
  },
};

interface AdminThemeContextValue {
  theme: AdminThemeKey;
  setTheme: (theme: AdminThemeKey) => void;
}

export const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

export function useAdminTheme(): AdminThemeContextValue {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) throw new Error('useAdminTheme() deve ser usado dentro de <AdminLayout>');
  return ctx;
}
