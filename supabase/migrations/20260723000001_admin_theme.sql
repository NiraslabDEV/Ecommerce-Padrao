-- ============================================================================
-- ECOMMERCE-PADRAO — tema do painel admin escolhivel pelo dono (poucos cliques)
-- 3 combinacoes prontas (ver apps/web/app/(admin)/admin-theme.ts): 'red'
-- (classico, default = comportamento atual), 'gold' (boutique, escuro+dourado),
-- 'light' (claro, espelha a loja). Aditivo: coluna nova em settings (singleton).
-- ============================================================================

alter table public.settings
  add column if not exists admin_theme text not null default 'red'
  check (admin_theme in ('red', 'gold', 'light'));
