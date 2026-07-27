'use client';

import { ADMIN_THEMES, useAdminTheme, type AdminThemeKey } from './admin-theme';

// Seletor de tema do painel — 3 combinações prontas (settings.admin_theme).
// Troca instantânea (o contexto já atualiza o layout inteiro) + persiste no
// servidor via useAdminTheme(). Sem redeploy, sem tocar em código.
export function AppearanceSection() {
  const { theme, setTheme } = useAdminTheme();

  return (
    <div>
      <h2 className="text-lg font-bold text-[var(--adm-text)] mb-1">Aparência do painel</h2>
      <p className="text-sm text-[var(--adm-muted)] mb-5">
        Escolha as cores do painel administrativo. Isto não afeta a loja pública — só o que a equipa vê aqui.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(Object.keys(ADMIN_THEMES) as AdminThemeKey[]).map((key) => {
          const def = ADMIN_THEMES[key];
          const active = theme === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTheme(key)}
              aria-pressed={active}
              className="text-left rounded-2xl p-4 border transition-all"
              style={{
                borderColor: active ? 'var(--adm-accent)' : 'var(--adm-border)',
                background: active ? 'color-mix(in srgb, var(--adm-accent) 8%, transparent)' : 'var(--adm-card)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 rounded-full border border-[var(--adm-border-strong)]" style={{ background: def.swatch[0] }} />
                <span className="w-6 h-6 rounded-full -ml-4 border border-[var(--adm-border-strong)]" style={{ background: def.swatch[1] }} />
              </div>
              <p className="font-semibold text-[var(--adm-text)]">
                {def.label}
                {active && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--adm-accent)' }}>✓ Ativo</span>}
              </p>
              <p className="text-xs mt-1 text-[var(--adm-muted)]">{def.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
