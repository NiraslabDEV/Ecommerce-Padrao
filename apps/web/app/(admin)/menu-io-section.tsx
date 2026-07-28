'use client';

/**
 * IMPORTAR / EXPORTAR lista de produtos.
 *
 * Padrão (docs/menu-format.md + docs/precos-e-promocoes.md):
 *  - Formato canónico = `menu.json` (o mesmo do `pnpm menu:import`/`menu:export`).
 *    O CSV é a projeção plana do mesmo formato, para abrir no Excel.
 *  - A CHAVE é o NOME: re-importar ATUALIZA a categoria/produto com o mesmo nome
 *    (não duplica). Nome novo = produto novo. Nada é apagado por importar.
 *  - Preços no ficheiro em MT decimal; a conversão para centavos é feita aqui
 *    pelo `@delivery/core` (money.ts) — nunca à mão.
 *  - Export lê `export_menu()`; import escreve por `import_menu()` (RPC idempotente).
 */

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  buildMenuExport,
  menuToCsv,
  csvToMenu,
  rowsFromExportRpc,
  normalizeMenuImport,
  type NormalizedMenu,
} from '@delivery/core';

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function MenuIoSection() {
  const supabase = createClient();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMessage, setOkMessage] = useState('');
  const [preview, setPreview] = useState<NormalizedMenu | null>(null);
  const [fileName, setFileName] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  async function exportMenu(format: 'json' | 'csv') {
    setError(''); setOkMessage(''); setBusy(true);
    const { data, error: err } = await supabase.rpc('export_menu');
    setBusy(false);

    if (err) { setError(`Erro ao exportar: ${err.message}`); return; }

    const { categories, items } = rowsFromExportRpc(data);
    const menu = buildMenuExport(categories, items);
    const total = menu.categories.reduce((s, c) => s + c.items.length, 0);

    if (total === 0) { setError('A loja ainda não tem produtos para exportar.'); return; }

    if (format === 'csv') {
      download(`produtos-${today}.csv`, menuToCsv(menu), 'text/csv');
    } else {
      download(`produtos-${today}.json`, JSON.stringify(menu, null, 2), 'application/json');
    }
    setOkMessage(`Exportado: ${total} produto(s) em ${menu.categories.length} categoria(s).`);
  }

  async function onFile(file: File) {
    setError(''); setOkMessage(''); setPreview(null); setFileName(file.name);
    const text = (await file.text()).replace(/^\uFEFF/, '');

    try {
      const raw = file.name.toLowerCase().endsWith('.csv') ? csvToMenu(text) : JSON.parse(text);
      setPreview(normalizeMenuImport(raw));
    } catch (e) {
      setError(`Ficheiro inválido: ${(e as Error).message}`);
    }
  }

  async function applyImport() {
    if (!preview) return;
    setError(''); setOkMessage(''); setBusy(true);
    const { data, error: err } = await supabase.rpc('import_menu', { p_payload: preview });
    setBusy(false);

    if (err) { setError(`Erro ao importar: ${err.message}`); return; }
    const result = data as { categories?: number; items?: number } | null;
    setOkMessage(`Importado: ${result?.items ?? 0} produto(s) em ${result?.categories ?? 0} categoria(s).`);
    setPreview(null);
    setFileName('');
  }

  const previewCount = preview?.categories.reduce((s, c) => s + c.items.length, 0) ?? 0;

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-[#EA1D2C] bg-[#EA1D2C]/10 border border-[#EA1D2C]/30 rounded-xl px-4 py-3">{error}</p>
      )}
      {okMessage && (
        <p className="text-sm text-green-400 bg-green-900/20 border border-green-700/40 rounded-xl px-4 py-3">{okMessage}</p>
      )}

      {/* ── Exportar ──────────────────────────────────────────────────── */}
      <section className="border border-white/[0.08] bg-white/[0.04] backdrop-blur-[12px] shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-xl p-5 space-y-3">
        <div>
          <h2 className="font-bold text-lg text-white">Exportar lista de produtos</h2>
          <p className="text-xs text-[#A8A8B0] mt-1">
            Descarrega tudo o que está na loja: categoria, produto, descrição, preço, preço antes,
            foto, disponibilidade e stock. Serve de cópia de segurança e para editar em massa.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => exportMenu('csv')}
            disabled={busy}
            className="bg-[#EA1D2C] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#c8161f] transition-colors disabled:opacity-50"
          >
            Exportar CSV (Excel)
          </button>
          <button
            onClick={() => exportMenu('json')}
            disabled={busy}
            className="border border-white/[0.12] text-[#A8A8B0] text-sm font-semibold px-4 py-2 rounded-lg hover:text-white transition-colors disabled:opacity-50"
          >
            Exportar JSON
          </button>
        </div>
      </section>

      {/* ── Importar ──────────────────────────────────────────────────── */}
      <section className="border border-white/[0.08] bg-white/[0.04] backdrop-blur-[12px] shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-bold text-lg text-white">Importar lista de produtos</h2>
          <p className="text-xs text-[#A8A8B0] mt-1">
            Aceita o ficheiro <b>CSV</b> (Excel) ou <b>JSON</b> exportado aqui. O <b>nome</b> é a chave:
            produto com nome já existente é <b>atualizado</b>; nome novo é <b>criado</b>. Importar
            nunca apaga produtos.
          </p>
          <p className="text-xs text-[#A8A8B0] mt-1">
            Colunas do CSV: <code className="text-white">categoria, produto, preco</code> (obrigatórias) +
            {' '}<code>descricao, preco_antes, foto_url, disponivel, controla_stock, stock, ordem</code>.
            Preços em MT (ex.: <code>900</code> ou <code>900,00</code>).
          </p>
        </div>

        <input
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
          className="w-full text-sm text-[#A8A8B0]"
        />

        {preview && (
          <div className="border border-white/[0.08] rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-black/20 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-white">
                <b>{fileName}</b> — {preview.categories.length} categoria(s), {previewCount} produto(s)
              </p>
              <button
                onClick={applyImport}
                disabled={busy}
                className="bg-[#EA1D2C] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#c8161f] transition-colors disabled:opacity-50"
              >
                {busy ? 'A importar…' : 'Importar para a loja'}
              </button>
            </div>
            <ul className="divide-y divide-white/[0.06] max-h-72 overflow-y-auto">
              {preview.categories.map((cat) => (
                <li key={cat.name} className="px-4 py-2.5">
                  <p className="text-xs font-bold text-white">{cat.name}</p>
                  <ul className="mt-1 space-y-0.5">
                    {cat.items.map((it) => (
                      <li key={it.name} className="text-xs text-[#A8A8B0] flex justify-between gap-3">
                        <span className="truncate">{it.name}</span>
                        <span className="shrink-0">
                          {it.compare_at_price_cents && (
                            <span className="line-through mr-1.5">{(it.compare_at_price_cents / 100).toFixed(2)}</span>
                          )}
                          <span className="text-white">{(it.price_cents / 100).toFixed(2)} MT</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
