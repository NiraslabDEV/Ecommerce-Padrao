'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

// Curadoria de "Produtos relacionados" (E3). Grava em public.product_related
// via a sessão authenticated (RLS staff_all) — mesmo padrão do OptionsEditor.
// Estes curados aparecem PRIMEIRO em get_related_products (antes do co-view /
// fallback de categoria).

interface ItemRef {
  id: string;
  name: string;
}

interface RelatedRow {
  id: string;
  related_item_id: string;
  sort: number;
}

export function RelatedEditor({ itemId }: { itemId: string }) {
  const supabase = createClient();
  const [allItems, setAllItems] = useState<ItemRef[]>([]);
  const [related, setRelated] = useState<RelatedRow[]>([]);
  const [pick, setPick] = useState('');
  const [err, setErr] = useState('');

  const refetch = useCallback(async () => {
    const [{ data: items }, { data: rels }] = await Promise.all([
      supabase.from('menu_items').select('id, name').order('name'),
      supabase.from('product_related').select('id, related_item_id, sort').eq('item_id', itemId).order('sort'),
    ]);
    setAllItems((items ?? []) as ItemRef[]);
    setRelated((rels ?? []) as RelatedRow[]);
  }, [supabase, itemId]);

  useEffect(() => { refetch(); }, [refetch]);

  const nameOf = (id: string) => allItems.find((i) => i.id === id)?.name ?? '—';
  const addable = allItems.filter((i) => i.id !== itemId && !related.some((r) => r.related_item_id === i.id));

  async function addRelated(relatedId: string) {
    setErr('');
    const sort = Math.max(0, ...related.map((r) => r.sort)) + 1;
    const { error } = await supabase.from('product_related').insert({ item_id: itemId, related_item_id: relatedId, sort });
    if (error) { setErr(`Erro: ${error.message}`); return; }
    setPick('');
    refetch();
  }

  async function removeRelated(id: string) {
    setErr('');
    const { error } = await supabase.from('product_related').delete().eq('id', id);
    if (error) { setErr(`Erro: ${error.message}`); return; }
    refetch();
  }

  // Sobe/desce trocando o sort com o vizinho.
  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= related.length) return;
    setErr('');
    const a = related[index];
    const b = related[target];
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('product_related').update({ sort: b.sort }).eq('id', a.id),
      supabase.from('product_related').update({ sort: a.sort }).eq('id', b.id),
    ]);
    if (e1 || e2) { setErr(`Erro: ${(e1 ?? e2)?.message}`); return; }
    refetch();
  }

  return (
    <div className="border-t border-white/[0.08] pt-4 space-y-3">
      <p className="text-xs font-semibold text-[#A8A8B0]">
        Produtos relacionados <span className="font-normal">(curados — aparecem primeiro no “Quem viu isto também viu”)</span>
      </p>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <ul className="space-y-1.5">
        {related.map((r, i) => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 text-white truncate">{nameOf(r.related_item_id)}</span>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-[#A8A8B0] px-1 disabled:opacity-30" aria-label="Subir">↑</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === related.length - 1} className="text-[#A8A8B0] px-1 disabled:opacity-30" aria-label="Descer">↓</button>
            <button type="button" onClick={() => removeRelated(r.id)} className="text-red-400 px-1" aria-label="Remover">✕</button>
          </li>
        ))}
        {related.length === 0 && (
          <li className="text-xs text-[#A8A8B0]">Sem curadoria — a loja usa co-view + mesma categoria automaticamente.</li>
        )}
      </ul>

      <div className="flex gap-2">
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="flex-1 bg-black/20 border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
        >
          <option value="">Adicionar produto relacionado…</option>
          {addable.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => pick && addRelated(pick)}
          disabled={!pick}
          className="bg-white/[0.08] text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-white/[0.14] transition-colors disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
