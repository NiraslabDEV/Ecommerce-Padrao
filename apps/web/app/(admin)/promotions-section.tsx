'use client';

/**
 * PROMOÇÕES — cortes de preço em massa (loja inteira / categoria / produto).
 *
 * Padrão (docs/precos-e-promocoes.md):
 *  - Uma campanha é uma REGRA. Nunca reescreve o preço do produto: desligar
 *    a campanha devolve o preço de tabela intacto.
 *  - Descontos NÃO acumulam: se várias campanhas tocam o mesmo produto,
 *    aplica-se a de MAIOR desconto.
 *  - O preço final é calculado no servidor (public.effective_price) e usado
 *    tanto pela loja (get_menu) como pela cobrança (create_order).
 *
 * Esta UI só escreve regras na tabela `promotions` — não toca em preços.
 */

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { formatMT as coreFormatMT, effectivePrice, type Cents, type Promotion as CorePromotion } from '@delivery/core';

const formatMT = (cents: number) => coreFormatMT(cents as Cents);

type Scope = 'store' | 'category' | 'item';
type DiscountType = 'pct' | 'cents';

interface Promotion {
  id: string;
  name: string;
  scope: Scope;
  category_id: string | null;
  menu_item_id: string | null;
  discount_type: DiscountType;
  discount_value: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

interface CategoryLite { id: string; name: string }
interface ItemLite { id: string; category_id: string; name: string; price_cents: number; compare_at_price_cents: number | null }

const SCOPE_LABEL: Record<Scope, string> = {
  store: 'Loja inteira',
  category: 'Categoria',
  item: 'Produto',
};

const toIsoOrNull = (local: string): string | null =>
  local.trim() === '' ? null : new Date(local).toISOString();


/** Estado legível da janela de datas (o servidor é que decide, isto é só rótulo). */
function windowLabel(p: Promotion): { text: string; live: boolean } {
  const now = Date.now();
  if (!p.active) return { text: 'Desligada', live: false };
  if (p.starts_at && new Date(p.starts_at).getTime() > now) {
    return { text: `Agendada para ${new Date(p.starts_at).toLocaleString('pt-MZ')}`, live: false };
  }
  if (p.ends_at && new Date(p.ends_at).getTime() <= now) {
    return { text: 'Terminada', live: false };
  }
  if (p.ends_at) return { text: `A correr até ${new Date(p.ends_at).toLocaleString('pt-MZ')}`, live: true };
  return { text: 'A correr', live: true };
}

export function PromotionsSection() {
  const supabase = createClient();

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [items, setItems] = useState<ItemLite[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // formulário
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Scope>('store');
  const [categoryId, setCategoryId] = useState('');
  const [menuItemId, setMenuItemId] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('pct');
  const [discountValue, setDiscountValue] = useState('30');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    const [{ data: promos }, { data: cats }, { data: its }] = await Promise.all([
      supabase.from('promotions').select('*').order('created_at', { ascending: false }),
      supabase.from('menu_categories').select('id, name').order('sort'),
      supabase.from('menu_items').select('id, category_id, name, price_cents, compare_at_price_cents').order('sort'),
    ]);
    setPromotions((promos ?? []) as Promotion[]);
    setCategories((cats ?? []) as CategoryLite[]);
    setItems((its ?? []) as ItemLite[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void refetch(); }, [refetch]);

  /** Quantos produtos a campanha atinge (para o dono ver o estrago antes de ligar). */
  function affectedCount(p: Pick<Promotion, 'scope' | 'category_id' | 'menu_item_id'>): number {
    if (p.scope === 'store') return items.length;
    if (p.scope === 'category') return items.filter((i) => i.category_id === p.category_id).length;
    return items.some((i) => i.id === p.menu_item_id) ? 1 : 0;
  }

  async function createPromotion(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const value = discountType === 'pct'
      ? Math.round(parseFloat(discountValue.replace(',', '.')))
      : Math.round(parseFloat(discountValue.replace(',', '.')) * 100); // MT → centavos

    if (!Number.isFinite(value) || value <= 0) {
      setError('Valor do desconto inválido.');
      return;
    }
    if (discountType === 'pct' && value > 100) {
      setError('A percentagem tem de estar entre 1 e 100.');
      return;
    }
    if (scope === 'category' && !categoryId) { setError('Escolhe a categoria.'); return; }
    if (scope === 'item' && !menuItemId) { setError('Escolhe o produto.'); return; }

    setSaving(true);
    const { error: err } = await supabase.from('promotions').insert({
      name: name.trim() || `${SCOPE_LABEL[scope]} -${discountType === 'pct' ? `${value}%` : formatMT(value)}`,
      scope,
      category_id: scope === 'category' ? categoryId : null,
      menu_item_id: scope === 'item' ? menuItemId : null,
      discount_type: discountType,
      discount_value: value,
      active: true,
      starts_at: toIsoOrNull(startsAt),
      ends_at: toIsoOrNull(endsAt),
    });
    setSaving(false);

    if (err) { setError(`Erro ao criar campanha: ${err.message}`); return; }
    setName(''); setDiscountValue('30'); setStartsAt(''); setEndsAt('');
    await refetch();
  }

  async function toggleActive(p: Promotion) {
    setError('');
    const { error: err } = await supabase.from('promotions').update({ active: !p.active }).eq('id', p.id);
    if (err) { setError(`Erro: ${err.message}`); return; }
    await refetch();
  }

  async function remove(id: string) {
    if (!confirm('Apagar esta campanha? Os preços voltam ao normal.')) return;
    const { error: err } = await supabase.from('promotions').delete().eq('id', id);
    if (err) { setError(`Erro: ${err.message}`); return; }
    await refetch();
  }

  // Pré-visualização: usa o MESMO motor do servidor (packages/core/pricing.ts)
  const previewPromos: CorePromotion[] = promotions.map((p) => ({
    scope: p.scope,
    category_id: p.category_id,
    menu_item_id: p.menu_item_id,
    discount_type: p.discount_type,
    discount_value: p.discount_value,
    active: p.active,
    starts_at: p.starts_at,
    ends_at: p.ends_at,
  }));

  const previewRows = items.slice(0, 6).map((i) => ({
    item: i,
    price: effectivePrice(i.price_cents, i.compare_at_price_cents, previewPromos, {
      itemId: i.id,
      categoryId: i.category_id,
    }),
  }));

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-[#EA1D2C] bg-[#EA1D2C]/10 border border-[#EA1D2C]/30 rounded-xl px-4 py-3">{error}</p>
      )}

      {/* ── Nova campanha ─────────────────────────────────────────────── */}
      <form
        onSubmit={createPromotion}
        className="border border-white/[0.08] bg-white/[0.04] backdrop-blur-[12px] shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-xl p-5 space-y-4"
      >
        <div>
          <h2 className="font-bold text-lg text-white">Nova campanha</h2>
          <p className="text-xs text-[#A8A8B0] mt-1">
            Corta o preço de uma vez só. Não mexe no preço dos produtos — desligar devolve tudo ao normal.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Nome (opcional)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
              placeholder="ex: Black Friday"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Aplica a</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
              className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
            >
              <option value="store">Loja inteira</option>
              <option value="category">Uma categoria</option>
              <option value="item">Um produto</option>
            </select>
          </div>

          {scope === 'category' && (
            <div>
              <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Categoria</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
              >
                <option value="">Escolhe…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {scope === 'item' && (
            <div>
              <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Produto</label>
              <select
                value={menuItemId}
                onChange={(e) => setMenuItemId(e.target.value)}
                className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
              >
                <option value="">Escolhe…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Tipo de desconto</label>
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as DiscountType)}
              className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
            >
              <option value="pct">Percentagem (%)</option>
              <option value="cents">Valor fixo (MT)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">
              {discountType === 'pct' ? 'Desconto (%)' : 'Desconto (MT)'}
            </label>
            <input
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              inputMode="decimal"
              required
              className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
              placeholder={discountType === 'pct' ? '30' : '100.00'}
            />
            {discountType === 'pct' && (
              <div className="flex gap-1.5 mt-2">
                {['10', '20', '30', '50', '70'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDiscountValue(v)}
                    className={`text-xs px-2 py-1 rounded-md border ${
                      discountValue === v
                        ? 'bg-[#EA1D2C] text-white border-[#EA1D2C]'
                        : 'border-white/[0.12] text-[#A8A8B0] hover:text-white'
                    }`}
                  >
                    -{v}%
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Começa (opcional)</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Acaba (opcional)</label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-[#A8A8B0]">
            Atinge <b className="text-white">{affectedCount({ scope, category_id: categoryId || null, menu_item_id: menuItemId || null })}</b> produto(s).
            {promotions.some((p) => p.active) && ' Se houver mais campanhas ativas, vence o maior desconto (não somam).'}
          </p>
          <button
            type="submit"
            disabled={saving}
            className="bg-[#EA1D2C] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#c8161f] transition-colors disabled:opacity-50"
          >
            {saving ? 'A criar…' : 'Criar campanha'}
          </button>
        </div>
      </form>

      {/* ── Campanhas existentes ──────────────────────────────────────── */}
      <section className="border border-white/[0.08] bg-white/[0.04] backdrop-blur-[12px] shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-black/20">
          <h2 className="font-bold text-white">Campanhas</h2>
        </div>

        {loading ? (
          <p className="text-[#A8A8B0] text-center py-8 text-sm">A carregar…</p>
        ) : promotions.length === 0 ? (
          <p className="text-[#A8A8B0] text-center py-8 text-sm">
            Sem campanhas. Cria uma acima (ex.: &quot;todos os perfumes -30%&quot;).
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {promotions.map((p) => {
              const w = windowLabel(p);
              const alvo =
                p.scope === 'category'
                  ? categories.find((c) => c.id === p.category_id)?.name ?? '—'
                  : p.scope === 'item'
                    ? items.find((i) => i.id === p.menu_item_id)?.name ?? '—'
                    : 'todos os produtos';
              return (
                <li key={p.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-white truncate">
                      {p.name}
                      <span className="ml-2 text-[11px] font-bold text-[#EA1D2C]">
                        -{p.discount_type === 'pct' ? `${p.discount_value}%` : formatMT(p.discount_value)}
                      </span>
                    </p>
                    <p className="text-xs text-[#A8A8B0]">
                      {SCOPE_LABEL[p.scope]} · {alvo} · {affectedCount(p)} produto(s)
                    </p>
                    <p className={`text-[11px] ${w.live ? 'text-green-400' : 'text-[#A8A8B0]'}`}>{w.text}</p>
                  </div>
                  <button
                    onClick={() => toggleActive(p)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                      p.active
                        ? 'bg-green-900/30 text-green-400 border border-green-700'
                        : 'bg-white/[0.08] text-[#A8A8B0]'
                    }`}
                  >
                    {p.active ? 'Ligada' : 'Desligada'}
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    className="text-red-400 text-sm px-1 hover:text-red-300"
                    aria-label={`Apagar ${p.name}`}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Pré-visualização (mesmo motor do servidor) ────────────────── */}
      {previewRows.length > 0 && (
        <section className="border border-white/[0.08] bg-white/[0.04] backdrop-blur-[12px] rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-black/20">
            <h2 className="font-bold text-white">Como fica na loja</h2>
            <p className="text-xs text-[#A8A8B0] mt-0.5">
              Amostra dos primeiros produtos. O preço real é sempre recalculado pelo servidor no pedido.
            </p>
          </div>
          <ul className="divide-y divide-white/[0.06]">
            {previewRows.map(({ item, price }) => (
              <li key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <span className="text-sm text-white truncate">{item.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {price.compare_at_cents !== null && (
                    <span className="text-xs text-[#A8A8B0] line-through">{formatMT(price.compare_at_cents)}</span>
                  )}
                  <span className="text-sm font-bold text-[#EA1D2C]">{formatMT(price.price_cents)}</span>
                  {price.discount_pct > 0 && (
                    <span className="text-[10px] font-bold bg-[#EA1D2C]/15 text-[#EA1D2C] rounded px-1.5 py-0.5">
                      -{price.discount_pct}%
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
