'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { formatMT, decimalStringToCents, centsToDecimalString, type Cents } from '@delivery/core';

// Gestão de referral_codes (F5.1 — Indique e Ganhe / Cupom). RLS staff_all já
// dá CRUD direto ao `authenticated`; sem RPC nova. O front público (validate_referral
// + create_order) já consome esta tabela — isto só estava sem UI de admin.

type RewardType = 'discount_cents' | 'discount_pct' | 'free_item';

interface MenuItemRef { id: string; name: string }

interface Coupon {
  id: string;
  code: string;
  owner_name: string;
  owner_phone: string | null;
  reward_type: RewardType;
  reward_value: number;
  gift_item_id: string | null;
  referrer_reward_cents: number;
  max_redemptions: number;
  active: boolean;
  expires_at: string | null;
  created_at: string;
}

const mt = (cents: number) => formatMT(cents as Cents);

function rewardLabel(c: Coupon, itemName: (id: string) => string): string {
  if (c.reward_type === 'discount_cents') return `Desconto: ${mt(c.reward_value)}`;
  if (c.reward_type === 'discount_pct') return `Desconto: ${c.reward_value}%`;
  return `🎁 Item grátis: ${c.gift_item_id ? itemName(c.gift_item_id) : '—'}`;
}

export function CouponsSection() {
  const supabase = createClient();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [redemptions, setRedemptions] = useState<Record<string, number>>({});
  const [items, setItems] = useState<MenuItemRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const [error, setError] = useState('');

  const refetch = useCallback(async () => {
    setLoading(true);
    const [{ data: cs }, { data: rs }, { data: its }] = await Promise.all([
      supabase.from('referral_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('referral_redemptions').select('code_id'),
      supabase.from('menu_items').select('id, name').order('name'),
    ]);
    setCoupons((cs ?? []) as Coupon[]);
    setItems((its ?? []) as MenuItemRef[]);
    const counts: Record<string, number> = {};
    (rs ?? []).forEach((r: { code_id: string }) => { counts[r.code_id] = (counts[r.code_id] ?? 0) + 1; });
    setRedemptions(counts);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { refetch(); }, [refetch]);

  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? '—';

  async function toggleActive(c: Coupon) {
    setError('');
    const { error: err } = await supabase.from('referral_codes').update({ active: !c.active }).eq('id', c.id);
    if (err) { setError(err.message); return; }
    refetch();
  }

  async function remove(c: Coupon) {
    if (!confirm(`Apagar o cupom "${c.code}"? Esta ação não pode ser desfeita.`)) return;
    setError('');
    const { error: err } = await supabase.from('referral_codes').delete().eq('id', c.id);
    if (err) { setError(err.message); return; }
    refetch();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Cupons</h2>
          <p className="text-xs text-[#A8A8B0] mt-0.5">Códigos de desconto ou presente que os clientes aplicam na loja.</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="bg-[#EA1D2C] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#c8161f] transition-colors"
        >
          + Novo cupom
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-[#A8A8B0]">A carregar…</p>
      ) : coupons.length === 0 ? (
        <p className="text-sm text-[#A8A8B0] border border-white/[0.08] rounded-xl p-6 text-center">
          Ainda não há cupons. Cria o primeiro com &ldquo;+ Novo cupom&rdquo;.
        </p>
      ) : (
        <div className="space-y-2">
          {coupons.map((c) => {
            const used = redemptions[c.id] ?? 0;
            const expired = c.expires_at ? new Date(c.expires_at) < new Date() : false;
            return (
              <div key={c.id} className="flex items-center gap-3 border border-white/[0.08] rounded-xl p-3.5 bg-white/[0.02]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-white tracking-wider">{c.code}</span>
                    {!c.active && <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white/[0.08] text-[#A8A8B0]">Inativo</span>}
                    {expired && <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-900/40 text-red-400">Expirado</span>}
                  </div>
                  <p className="text-sm text-[#e8e8ea] mt-0.5">{rewardLabel(c, itemName)}</p>
                  <p className="text-xs text-[#A8A8B0] mt-0.5">
                    {used}/{c.max_redemptions} resgates
                    {c.owner_name && ` · de ${c.owner_name}`}
                    {c.expires_at && ` · válido até ${new Date(c.expires_at).toLocaleDateString('pt-MZ')}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setEditing(c)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/[0.08] text-[#A8A8B0] hover:text-white transition-colors">Editar</button>
                  <button onClick={() => toggleActive(c)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/[0.08] text-[#A8A8B0] hover:text-white transition-colors">{c.active ? 'Desativar' : 'Ativar'}</button>
                  <button onClick={() => remove(c)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/[0.08] text-red-400 hover:bg-red-900/20 transition-colors">Apagar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <CouponModal
          coupon={editing}
          items={items}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refetch(); }}
        />
      )}
    </div>
  );
}

function CouponModal({
  coupon, items, onClose, onSaved,
}: {
  coupon: Coupon | 'new';
  items: MenuItemRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const isNew = coupon === 'new';

  const [code, setCode] = useState(isNew ? '' : coupon.code);
  const [ownerName, setOwnerName] = useState(isNew ? '' : coupon.owner_name);
  const [rewardType, setRewardType] = useState<RewardType>(isNew ? 'discount_cents' : coupon.reward_type);
  const [valueMT, setValueMT] = useState(isNew ? '' : (coupon.reward_type === 'discount_cents' ? centsToDecimalString(coupon.reward_value as Cents) : ''));
  const [valuePct, setValuePct] = useState(isNew ? '' : (coupon.reward_type === 'discount_pct' ? String(coupon.reward_value) : ''));
  const [giftItemId, setGiftItemId] = useState(isNew ? '' : (coupon.gift_item_id ?? ''));
  const [maxRedemptions, setMaxRedemptions] = useState(isNew ? '1' : String(coupon.max_redemptions));
  const [expiresAt, setExpiresAt] = useState(isNew ? '' : (coupon.expires_at ? coupon.expires_at.slice(0, 10) : ''));
  const [active, setActive] = useState(isNew ? true : coupon.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!code.trim()) { setError('Indica o código.'); return; }

    let rewardValue = 0;
    if (rewardType === 'discount_cents') {
      try { rewardValue = decimalStringToCents(valueMT.replace(',', '.')); }
      catch { setError('Valor de desconto inválido. Usa o formato 50.00'); return; }
    } else if (rewardType === 'discount_pct') {
      const pct = parseInt(valuePct, 10);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) { setError('Percentagem deve ser entre 1 e 100.'); return; }
      rewardValue = pct;
    } else if (rewardType === 'free_item' && !giftItemId) {
      setError('Escolhe o produto que será o presente.');
      return;
    }

    const maxR = parseInt(maxRedemptions, 10);
    if (!Number.isFinite(maxR) || maxR < 1) { setError('Limite de resgates deve ser pelo menos 1.'); return; }

    const payload = {
      code: code.trim().toUpperCase(),
      owner_name: ownerName.trim(),
      reward_type: rewardType,
      reward_value: rewardValue,
      gift_item_id: rewardType === 'free_item' ? giftItemId : null,
      max_redemptions: maxR,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      active,
    };

    setSaving(true);
    const { error: err } = isNew
      ? await supabase.from('referral_codes').insert(payload)
      : await supabase.from('referral_codes').update(payload).eq('id', coupon.id);
    setSaving(false);

    if (err) { setError(err.message.includes('duplicate') ? 'Já existe um cupom com este código.' : err.message); return; }
    onSaved();
  }

  const inputCls = 'w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]';
  const labelCls = 'block text-xs font-semibold text-[#A8A8B0] mb-1';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-[4px] z-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSave}
        className="border border-white/[0.08] bg-white/[0.04] backdrop-blur-[12px] shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="font-bold text-lg text-[#EA1D2C]">{isNew ? 'Novo cupom' : 'Editar cupom'}</h2>

        <div>
          <label className={labelCls}>Código</label>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required className={`${inputCls} font-mono tracking-wider`} placeholder="ex: BEMVINDA10" maxLength={50} />
        </div>

        <div>
          <label className={labelCls}>Nome do dono <span className="font-normal">(opcional — vazio = campanha manual)</span></label>
          <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} placeholder="ex: Maria" />
        </div>

        <div>
          <label className={labelCls}>Tipo de benefício</label>
          <select value={rewardType} onChange={(e) => setRewardType(e.target.value as RewardType)} className={inputCls}>
            <option value="discount_cents">Desconto em MT</option>
            <option value="discount_pct">Desconto em %</option>
            <option value="free_item">Item grátis</option>
          </select>
        </div>

        {rewardType === 'discount_cents' && (
          <div>
            <label className={labelCls}>Valor do desconto (MT)</label>
            <input value={valueMT} onChange={(e) => setValueMT(e.target.value)} inputMode="decimal" required className={inputCls} placeholder="ex: 100.00" />
          </div>
        )}

        {rewardType === 'discount_pct' && (
          <div>
            <label className={labelCls}>Percentagem de desconto</label>
            <input value={valuePct} onChange={(e) => setValuePct(e.target.value)} inputMode="numeric" required className={inputCls} placeholder="ex: 10" />
          </div>
        )}

        {rewardType === 'free_item' && (
          <div>
            <label className={labelCls}>Produto oferecido</label>
            <select value={giftItemId} onChange={(e) => setGiftItemId(e.target.value)} required className={inputCls}>
              <option value="">Escolhe um produto…</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className={labelCls}>Limite de resgates</label>
          <input value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} inputMode="numeric" required className={inputCls} placeholder="1" />
        </div>

        <div>
          <label className={labelCls}>Expira em <span className="font-normal">(opcional)</span></label>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="couponActive" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded bg-black/20 border-white/[0.08] text-[#EA1D2C] focus:ring-[#EA1D2C]" />
          <label htmlFor="couponActive" className="text-xs font-semibold text-[#A8A8B0]">Ativo</label>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 border border-white/[0.08] text-[#A8A8B0] text-sm font-semibold py-2 rounded-lg hover:text-white transition-colors">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 bg-[#EA1D2C] text-white text-sm font-semibold py-2 rounded-lg hover:bg-[#c8161f] transition-colors disabled:opacity-50">
            {saving ? 'A guardar…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}
