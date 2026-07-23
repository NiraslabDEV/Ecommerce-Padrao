'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { formatMT, type Cents } from '@delivery/core';
import { useCart } from '@/utils/useCart';
import { createClient } from '@/utils/supabase/client';
import { trackViewMenu, trackViewItem, trackAddToCart, trackLead, trackCouponApplied, type TrackItem } from '@/lib/analytics/track';
import { brand } from '@brand';

const mt = (cents: number) => formatMT(cents as Cents);
const ST = brand.storefront;

type Variant = { id: string; name: string; price_cents: number; is_default?: boolean };
type Addon = { id: string; name: string; price_cents: number };
type MenuItem = { id: string; name: string; description: string | null; price_cents: number; photo_url: string | null; available?: boolean; variants?: Variant[]; addons?: Addon[] };
type Category = { id: string; name: string; photo_url?: string | null; items: MenuItem[] };
type ReferralResult = {
  valid: boolean;
  reason?: string;
  reward_type?: 'discount_cents' | 'discount_pct' | 'free_item';
  reward_value?: number;
  gift_item_id?: string;
  gift_item_name?: string;
  gift_item_photo_url?: string | null;
};

const REFERRAL_KEY = 'referral_code';
const REFERRAL_RESULT_KEY = 'referral_result';

// preço unitário de uma linha = (variante escolhida ou base) + Σ adicionais.
// PREVIEW no client; o servidor (create_order) é a verdade (CLAUDE §6).
function lineUnitPrice(item: MenuItem, variantId?: string, addonIds: string[] = []): number {
  const base = variantId ? (item.variants?.find((v) => v.id === variantId)?.price_cents ?? item.price_cents) : item.price_cents;
  const addons = (item.addons ?? []).filter((a) => addonIds.includes(a.id)).reduce((s, a) => s + a.price_cents, 0);
  return base + addons;
}
const hasOptions = (item: MenuItem) => Boolean(item.variants?.length || item.addons?.length);
type ReorderItem = { menu_item_id: string; qty: number };
type FavItem = { menu_item_id: string; name: string; qty: number };
type RecentOrder = { id: string; order_number: string; status: string; total_cents: number; created_at: string };
type CustomerSummary = { phone: string; name: string | null; orders_count: number; total_spent_cents: number; favorites: FavItem[]; recent_orders: RecentOrder[] };
type CustomerOrder = { id: string; order_number: string; status: string; fulfillment_type: string; total_cents: number; created_at: string; scheduled_for: string | null; items: { menu_item_id: string; name: string; qty: number }[] };

// foto do item ou fallback determinístico dos assets da marca (whitelabel)
const imgFor = (item: MenuItem, idx: number) =>
  item.photo_url || ST.fallbackImages[idx % ST.fallbackImages.length];

const FAV_KEY = 'fav_items';
const DL_PHONE_KEY = 'dl_phone';

// rótulo/cor de estado para a lista "Meus Pedidos"
const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  awaiting_approval: { label: 'Aguarda aprovação', color: '#f59e0b' },
  awaiting_payment: { label: 'Aguarda pagamento', color: '#f59e0b' },
  paid: { label: 'Pago', color: '#3b82f6' },
  approved: { label: 'Aceite', color: '#22c55e' },
  in_preparation: { label: 'Em preparo', color: '#f59e0b' },
  ready: { label: 'Pronto', color: '#8b5cf6' },
  delivered: { label: 'Entregue', color: '#22c55e' },
  cancelled: { label: 'Cancelado', color: '#ef4444' },
  payment_failed: { label: 'Falhou', color: '#ef4444' },
};
const isActiveOrder = (s: string) => ['awaiting_approval', 'awaiting_payment', 'paid', 'approved', 'in_preparation', 'ready'].includes(s);

export default function MenuPage() {
  const router = useRouter();
  const [cartOpen, setCartOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [product, setProduct] = useState<MenuItem | null>(null);
  const [productQty, setProductQty] = useState(1);
  const [selVariant, setSelVariant] = useState<string | undefined>(undefined);
  const [selAddons, setSelAddons] = useState<string[]>([]);
  const [account, setAccount] = useState<'identify' | 'orders' | 'profile' | null>(null);

  // F5.2 — barra de referral
  const [refInput, setRefInput] = useState('');
  const [refResult, setRefResult] = useState<ReferralResult | null>(null);
  const [refLoading, setRefLoading] = useState(false);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [giftItemIds, setGiftItemIds] = useState<Set<string>>(new Set());
  const [identifyNext, setIdentifyNext] = useState<'orders' | 'profile'>('profile');
  const [phone, setPhone] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [myOrders, setMyOrders] = useState<CustomerOrder[] | null>(null);
  const { cart, add, setQty, setQtyByIndex, qtyOf, count, clear } = useCart();
  const supabase = createClient();

  const { data: menuData, isLoading, error } = useQuery({
    queryKey: ['menu'],
    queryFn: async () => {
      const response = await fetch('/api/menu');
      if (!response.ok) throw new Error('Failed to fetch menu');
      return response.json();
    },
  });

  const categories: Category[] = menuData?.categories || [];
  const acceptingOrders = menuData?.accepting_orders ?? true;
  const promoBannerUrl: string | null = menuData?.promo_banner_url ?? null;
  const promoCode: string | null = menuData?.promo_code ?? null;

  // null = modo browse (todos os carrosséis); string = modo filtro (só essa categoria, vertical)
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [promoDismissed, setPromoDismissed] = useState(false);
  const [promoCopied, setPromoCopied] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem('promo_dismissed');
    if (dismissed) setPromoDismissed(true);
  }, []);

  const dismissPromo = () => {
    setPromoDismissed(true);
    sessionStorage.setItem('promo_dismissed', '1');
  };

  const copyPromoCode = () => {
    if (!promoCode) return;
    navigator.clipboard.writeText(promoCode).then(() => {
      setPromoCopied(true);
      setTimeout(() => setPromoCopied(false), 2000);
    });
  };

  // Toggle: clicar na bolinha activa desselecciona (volta aos carrosséis)
  const selectCategory = (id: string) => {
    setActiveCategory((prev) => (prev === id ? null : id));
  };

  // favoritos (cosmético, local)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FAV_KEY);
      if (saved) setFavorites(new Set(JSON.parse(saved)));
    } catch { /* ignora */ }
  }, []);
  const toggleFav = (id: string) =>
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      return next;
    });

  // toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // view_menu — uma vez quando o cardápio carrega
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current || !menuData?.categories) return;
    viewedRef.current = true;
    const flat: TrackItem[] = menuData.categories.flatMap((c: Category) =>
      (c.items || []).map((i) => ({ id: i.id, name: i.name, price_cents: i.price_cents })),
    );
    if (flat.length) trackViewMenu(flat);
  }, [menuData]);

  function handleAdd(item: MenuItem) {
    add(item.id);
    trackAddToCart({ id: item.id, name: item.name, price_cents: item.price_cents, qty: 1 });
  }

  function openProduct(item: MenuItem) {
    setProduct(item);
    setProductQty(1);
    // tamanho: pré-seleciona o padrão (ou o primeiro) se houver variantes
    const def = item.variants?.find((v) => v.is_default) ?? item.variants?.[0];
    setSelVariant(def?.id);
    setSelAddons([]);
    trackViewItem({ id: item.id, name: item.name, price_cents: item.price_cents });
  }
  const categoryOf = (id: string) => categories.find((c) => c.items.some((i) => i.id === id))?.name ?? '';

  // ── Conta (F7): identificação soft por telefone (sem OTP) ────────────────
  const persistPhone = (p: string) => {
    localStorage.setItem(DL_PHONE_KEY, p);
    document.cookie = `dl_phone=${encodeURIComponent(p)}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
  };
  const identify = async (p: string, name?: string): Promise<boolean> => {
    const { data, error: err } = await supabase.rpc('identify_customer', name ? { p_phone: p, p_name: name } : { p_phone: p });
    if (err || !data) { setToast('Não foi possível identificar. Tenta de novo.'); return false; }
    persistPhone(p); setPhone(p); setCustomer(data as CustomerSummary);
    return true;
  };
  const logout = () => {
    localStorage.removeItem(DL_PHONE_KEY);
    document.cookie = 'dl_phone=; path=/; max-age=0';
    setPhone(null); setCustomer(null); setMyOrders(null); setAccount(null);
    setToast('Sessão terminada.');
  };
  const loadMyOrders = async (p: string) => {
    const { data } = await supabase.rpc('get_customer_orders', { p_phone: p });
    setMyOrders(((data as { orders?: CustomerOrder[] })?.orders) ?? []);
  };
  const reorder = (items: ReorderItem[]) => {
    items.forEach((it) => add(it.menu_item_id, it.qty));
    setAccount(null); setCartOpen(true); setToast('Itens adicionados ao carrinho');
  };
  const openOrders = () => { if (phone) { setAccount('orders'); loadMyOrders(phone); } else { setIdentifyNext('orders'); setAccount('identify'); } };
  const openProfile = () => { if (phone) setAccount('profile'); else { setIdentifyNext('profile'); setAccount('identify'); } };
  const onIdentified = async (p: string, name?: string) => {
    if (!(await identify(p, name))) return;
    if (identifyNext === 'orders') { setAccount('orders'); loadMyOrders(p); } else setAccount('profile');
  };

  // restaura a identificação ao carregar
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(DL_PHONE_KEY) : null;
    if (saved) { setPhone(saved); identify(saved); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // restaura o código de referral aplicado ao carregar
  useEffect(() => {
    const savedCode   = localStorage.getItem(REFERRAL_KEY);
    const savedResult = localStorage.getItem(REFERRAL_RESULT_KEY);
    if (savedCode && savedResult) {
      try {
        const parsed = JSON.parse(savedResult) as ReferralResult;
        setAppliedCode(savedCode);
        setRefResult(parsed);
        setRefInput(savedCode);
        if (parsed.gift_item_id) setGiftItemIds(new Set([parsed.gift_item_id]));
      } catch { /* ignora */ }
    }
  }, []);

  const applyReferral = async () => {
    const code = refInput.trim().toUpperCase();
    if (!code) return;
    setRefLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('validate_referral', {
        p_code:  code,
        p_phone: phone ?? '',
      });
      if (rpcError || !data) { setRefResult({ valid: false, reason: 'invalid_or_expired' }); return; }
      const result = data as ReferralResult;
      setRefResult(result);
      if (result.valid) {
        setAppliedCode(code);
        localStorage.setItem(REFERRAL_KEY, code);
        localStorage.setItem(REFERRAL_RESULT_KEY, JSON.stringify(result));
        trackCouponApplied(code);
        if (result.gift_item_id) {
          setGiftItemIds(new Set([result.gift_item_id]));
          // auto-adicionar o brinde ao carrinho se ainda não estiver lá
          add(result.gift_item_id, 1);
          setToast('🎁 Código aplicado! O seu presente foi adicionado ao carrinho.');
        } else {
          setToast('✅ Código aplicado! Desconto activo no checkout.');
        }
      }
    } finally {
      setRefLoading(false);
    }
  };

  const removeReferral = () => {
    setAppliedCode(null);
    setRefResult(null);
    setRefInput('');
    setGiftItemIds(new Set());
    localStorage.removeItem(REFERRAL_KEY);
    localStorage.removeItem(REFERRAL_RESULT_KEY);
  };

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  if (!acceptingOrders) return <Shell><WaitlistForm /></Shell>;

  if (isLoading) {
    return (
      <Shell>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--st-primary)' }} />
            <p style={{ color: 'var(--st-muted)' }}>A carregar cardápio…</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center">
            <p className="mb-2" style={{ color: 'var(--st-primary)' }}>Erro ao carregar cardápio</p>
            <button onClick={() => window.location.reload()} className="underline" style={{ color: 'var(--st-primary)' }}>
              Tentar novamente
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  const allItems = categories.flatMap((c) => c.items);
  const lineDetail = (id: string) => allItems.find((i) => i.id === id);
  const subtotal = cart.reduce((s, l) => {
    const it = lineDetail(l.menuItemId);
    return s + (it ? lineUnitPrice(it, l.variantId, l.addonIds) : 0) * l.qty;
  }, 0);
  // índice global estável para o fallback de imagem
  const globalIndex = (id: string) => allItems.findIndex((i) => i.id === id);

  const Stepper = ({ item }: { item: MenuItem }) => {
    const qty = qtyOf(item.id);
    if (qty === 0) {
      return (
        <button
          onClick={(e) => { e.stopPropagation(); handleAdd(item); }}
          className="w-8 h-8 rounded-full grid place-items-center text-white font-bold shrink-0"
          style={{ background: 'var(--st-grad)' }}
          aria-label={`Adicionar ${item.name}`}
        >+</button>
      );
    }
    return (
      <div className="flex items-center gap-1.5 rounded-full px-1 py-0.5 shrink-0" style={{ background: '#111', border: '1px solid var(--st-line)' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setQty(item.id, qty - 1)} className="w-6 h-6 grid place-items-center text-white font-bold" aria-label="Diminuir">−</button>
        <span className="text-white text-sm font-bold w-4 text-center">{qty}</span>
        <button onClick={() => handleAdd(item)} className="w-6 h-6 grid place-items-center font-bold" style={{ color: 'var(--st-primary)' }} aria-label="Aumentar">+</button>
      </div>
    );
  };

  // Card de produto — carousel=true: largura fixa 150px horizontal; false: grid vertical
  const FoodCard = ({ item, carousel = false }: { item: MenuItem; carousel?: boolean }) => {
    const fav = favorites.has(item.id);
    return (
      <div
        onClick={() => openProduct(item)}
        className={`rounded-2xl overflow-hidden cursor-pointer${carousel ? ' shrink-0 w-[150px]' : ' w-full'}`}
        style={{ background: 'var(--st-card)', border: '1px solid var(--st-line)' }}
      >
        <div className="relative h-[108px]">
          <Image src={imgFor(item, globalIndex(item.id))} alt={item.name} fill sizes="150px" className="object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.55) 100%)' }} />
          <button
            onClick={(e) => { e.stopPropagation(); toggleFav(item.id); }}
            className="absolute top-2 right-2 w-7 h-7 rounded-full grid place-items-center text-sm"
            style={{ background: 'rgba(0,0,0,0.45)', color: fav ? 'var(--st-primary)' : '#ddd' }}
            aria-label="Favorito"
          >{fav ? '♥' : '♡'}</button>
        </div>
        <div className="p-2.5">
          <div className="text-white font-bold text-[13px] leading-tight truncate">{item.name}</div>
          {item.description && <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--st-muted)' }}>{item.description}</div>}
          <div className="flex items-center justify-between mt-2">
            <span className="text-white font-extrabold text-[13px]">
              {hasOptions(item) && <span className="text-[10px] font-semibold mr-0.5" style={{ color: 'var(--st-muted)' }}>desde </span>}
              {mt(item.price_cents)}
            </span>
            {hasOptions(item) ? (
              <button
                onClick={(e) => { e.stopPropagation(); openProduct(item); }}
                className="w-8 h-8 rounded-full grid place-items-center text-white font-bold shrink-0"
                style={{ background: 'var(--st-grad)' }}
                aria-label={`Escolher opções de ${item.name}`}
              >+</button>
            ) : (
              <Stepper item={item} />
            )}
          </div>
        </div>
      </div>
    );
  };

  // Card de lista (modo filtro): faixa full-width com foto à esquerda e info à direita
  const ListCard = ({ item }: { item: MenuItem }) => {
    const fav = favorites.has(item.id);
    return (
      <div
        onClick={() => openProduct(item)}
        className="flex items-center gap-3 cursor-pointer py-3 border-b"
        style={{ borderColor: 'var(--st-line)' }}
      >
        {/* Foto quadrada */}
        <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0">
          <Image src={imgFor(item, globalIndex(item.id))} alt={item.name} fill sizes="80px" className="object-cover" />
          <button
            onClick={(e) => { e.stopPropagation(); toggleFav(item.id); }}
            className="absolute top-1 right-1 w-5 h-5 rounded-full grid place-items-center text-[10px]"
            style={{ background: 'rgba(0,0,0,0.5)', color: fav ? 'var(--st-primary)' : '#ddd' }}
            aria-label="Favorito"
          >{fav ? '♥' : '♡'}</button>
        </div>

        {/* Informação — expande lateralmente */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-[14px] leading-tight">{item.name}</p>
          {item.description && (
            <p className="text-[12px] mt-0.5 line-clamp-2 leading-snug" style={{ color: 'var(--st-muted)' }}>
              {item.description}
            </p>
          )}
          <div className="flex items-center justify-between mt-2">
            <span className="text-white font-extrabold text-[14px]">
              {hasOptions(item) && <span className="text-[10px] font-semibold mr-0.5" style={{ color: 'var(--st-muted)' }}>desde </span>}
              {mt(item.price_cents)}
            </span>
            <div onClick={(e) => e.stopPropagation()}>
              {hasOptions(item) ? (
                <button
                  onClick={() => openProduct(item)}
                  className="w-8 h-8 rounded-full grid place-items-center text-white font-bold shrink-0"
                  style={{ background: 'var(--st-grad)' }}
                  aria-label={`Escolher ${item.name}`}
                >+</button>
              ) : (
                <Stepper item={item} />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const NAV = [
    { id: 'home', label: 'Início', onClick: scrollTop, active: true, path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z' },
    { id: 'menu', label: 'Cardápio', onClick: () => scrollTo('cardapio'), path: 'M4 6h16M4 12h16M4 18h10' },
    { id: 'orders', label: 'Pedidos', onClick: openOrders, path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { id: 'perfil', label: 'Perfil', onClick: openProfile, path: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z' },
  ];

  const favCount = favorites.size;

  return (
    <Shell>
      <div className="pb-28">
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-3 pb-2.5">
          <div className="font-black text-sm tracking-[2px] text-white border-2 border-white rounded-md px-2.5 py-1">{ST.logoText}</div>
          <div className="flex items-center gap-2.5">
            <button onClick={() => setToast('Favoritos chegam em breve.')} className="relative w-9 h-9 rounded-full grid place-items-center" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--st-primary)' }} aria-label="Favoritos">
              ♥
              {favCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 grid place-items-center rounded-full text-[8px] font-extrabold text-white" style={{ background: 'var(--st-primary)' }}>{favCount}</span>}
            </button>
            <button onClick={() => setToast('Sem notificações novas.')} className="w-9 h-9 rounded-full grid place-items-center text-base" style={{ background: 'rgba(255,255,255,0.08)' }} aria-label="Notificações">🔔</button>
          </div>
        </header>

        {/* Hero */}
        <button onClick={() => scrollTo('cardapio')} className="block w-full text-left relative h-[400px] overflow-hidden">
          <Image src={ST.hero.image} alt={brand.name} fill priority sizes="(max-width:480px) 100vw, 480px" className="object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(120deg, rgba(10,5,2,0.85) 0%, rgba(20,10,5,0.55) 55%, rgba(10,5,2,0.25) 100%)' }} />
          <div className="absolute bottom-0 left-0 p-5 max-w-[260px]">
            <div className="font-black text-white text-2xl leading-[1.1] mb-1.5" style={{ textWrap: 'balance' } as React.CSSProperties}>{ST.hero.title}</div>
            <div className="text-[12px] mb-3" style={{ color: 'rgba(255,255,255,0.75)' }}>{ST.hero.subtitle}</div>
            <span className="inline-block bg-white text-[#111] rounded-lg px-4 py-2 font-extrabold text-[11px] tracking-wide">{ST.hero.cta}</span>
          </div>
        </button>

        {/* Cupom promocional — sobreposto ao hero, configurável no admin */}
        {(promoBannerUrl || promoCode) && !promoDismissed && (
          <div className="px-4 -mt-6 relative z-10">
            <div className="rounded-2xl overflow-hidden flex items-stretch shadow-xl" style={{ background: 'var(--st-card)', border: '1px solid var(--st-line)' }}>
              {promoBannerUrl && (
                <div className="relative w-28 shrink-0">
                  <Image src={promoBannerUrl} alt="Cupom" fill sizes="112px" className="object-cover" />
                </div>
              )}
              <div className="flex-1 p-3 min-w-0">
                <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--st-muted)' }}>Use o cupom:</p>
                {promoCode && (
                  <button
                    onClick={copyPromoCode}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1 mb-1"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid var(--st-line)' }}
                    aria-label="Copiar código"
                  >
                    <span className="font-mono font-extrabold text-sm text-white tracking-wider">{promoCode}</span>
                    <span className="text-[14px]">{promoCopied ? '✓' : '⧉'}</span>
                  </button>
                )}
                <p className="text-[10px] leading-tight" style={{ color: 'var(--st-muted)' }}>
                  Válido apenas para a primeira compra. Não cumulativo com outras promoções.
                </p>
              </div>
              <button onClick={dismissPromo} className="w-8 shrink-0 grid place-items-center text-lg" style={{ color: 'var(--st-muted)' }} aria-label="Fechar">✕</button>
            </div>
          </div>
        )}

        {/* Barra de código de amigo (F5.2) */}
        <div className="px-5 pt-4">
          {appliedCode ? (
            <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: '#0f2a1a', border: '1px solid #22c55e44' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[#22c55e] text-lg">✓</span>
                <div className="min-w-0">
                  <span className="text-[#22c55e] font-bold text-sm">{appliedCode}</span>
                  {refResult?.reward_type === 'discount_cents' && (
                    <span className="block text-[11px]" style={{ color: 'var(--st-muted)' }}>
                      Desconto: -{mt(refResult.reward_value ?? 0)}
                    </span>
                  )}
                  {refResult?.reward_type === 'discount_pct' && (
                    <span className="block text-[11px]" style={{ color: 'var(--st-muted)' }}>
                      Desconto: -{refResult.reward_value}%
                    </span>
                  )}
                  {refResult?.reward_type === 'free_item' && (
                    <span className="block text-[11px]" style={{ color: 'var(--st-muted)' }}>
                      🎁 {refResult.gift_item_name ?? 'Brinde'} adicionado ao carrinho
                    </span>
                  )}
                </div>
              </div>
              <button onClick={removeReferral} className="text-sm shrink-0 ml-3" style={{ color: 'var(--st-muted)' }} aria-label="Remover código">✕</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={refInput}
                onChange={(e) => setRefInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && applyReferral()}
                placeholder="Código do teu amigo 🎁"
                maxLength={50}
                className="flex-1 bg-[var(--st-card)] border border-[var(--st-line)] rounded-xl px-4 py-2.5 text-white placeholder:text-[var(--st-muted)] text-sm focus:border-[var(--st-primary)] focus:outline-none"
                aria-label="Código de referral"
              />
              <button
                onClick={applyReferral}
                disabled={refLoading || !refInput.trim()}
                className="px-4 py-2.5 rounded-xl font-bold text-white text-sm transition-all active:scale-[0.97] disabled:opacity-50 shrink-0"
                style={{ background: 'var(--st-grad)' }}
              >
                {refLoading ? '…' : 'Aplicar'}
              </button>
            </div>
          )}
          {refResult && !refResult.valid && (
            <p className="mt-1.5 text-xs px-1" style={{ color: 'var(--st-primary)' }}>
              {refResult.reason === 'auto_redemption'    ? 'Não podes usar o teu próprio código.' :
               refResult.reason === 'already_redeemed'  ? 'Já usaste este código antes.' :
               refResult.reason === 'max_redemptions_reached' ? 'Este código atingiu o limite de utilizações.' :
               'Código inválido ou expirado.'}
            </p>
          )}
        </div>

        {/* SEU PRESENTE — visível quando código free_item aplicado */}
        {refResult?.valid && refResult.reward_type === 'free_item' && refResult.gift_item_id && (
          <div className="px-5 pt-4">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-white font-bold text-base">🎁 SEU PRESENTE</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <div className="shrink-0 w-[150px] rounded-2xl overflow-hidden" style={{ background: 'var(--st-card)', border: '1px solid #22c55e44' }}>
                {refResult.gift_item_photo_url ? (
                  <div className="relative h-[108px]">
                    <Image src={refResult.gift_item_photo_url} alt={refResult.gift_item_name ?? 'Brinde'} fill sizes="150px" className="object-cover" />
                  </div>
                ) : (
                  <div className="h-[108px] grid place-items-center text-4xl" style={{ background: '#0f2a1a' }}>🎁</div>
                )}
                <div className="p-2.5">
                  <div className="text-white font-bold text-[13px] leading-tight truncate">{refResult.gift_item_name ?? 'Brinde'}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-extrabold text-[13px]" style={{ color: '#22c55e' }}>GRÁTIS</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Categorias — barra circular estilo Instagram highlights (sticky) */}
        {categories.length > 0 && (
          <div id="cardapio" className="sticky top-0 z-10 pt-4 pb-2" style={{ background: 'var(--st-bg)' }}>
            <div className="flex gap-4 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
              {categories.filter((c) => c.items.length > 0).map((cat) => {
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => selectCategory(cat.id)}
                    className="flex flex-col items-center gap-1.5 shrink-0"
                    aria-pressed={isActive}
                  >
                    <div
                      className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center shrink-0"
                      style={{
                        border: isActive ? '2.5px solid var(--st-primary)' : '2.5px solid var(--st-line)',
                        boxShadow: isActive ? '0 0 0 2px var(--st-primary)' : 'none',
                        background: 'var(--st-card)',
                        transition: 'box-shadow 0.2s, border-color 0.2s',
                      }}
                    >
                      {cat.photo_url ? (
                        <Image src={cat.photo_url} alt={cat.name} width={64} height={64} className="object-cover w-full h-full" />
                      ) : (
                        <span className="text-2xl font-black text-white">{cat.name[0]}</span>
                      )}
                    </div>
                    <span
                      className="text-[11px] font-semibold text-center leading-tight max-w-[64px] truncate"
                      style={{ color: isActive ? 'var(--st-primary)' : 'var(--st-muted)' }}
                    >
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Cardápio */}
        {activeCategory === null ? (
          /* ── Modo browse: carrosséis horizontais por categoria (default) ── */
          <div className="pt-5 space-y-6">
            {categories.length === 0 && (
              <p className="text-center py-12" style={{ color: 'var(--st-muted)' }}>Cardápio em breve.</p>
            )}
            {categories.map((cat) => (
              cat.items.length > 0 && (
                <section key={cat.id}>
                  <div className="flex items-center justify-between px-5 mb-3">
                    <span className="text-white font-bold text-base">{cat.name}</span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pl-5 pr-3 pb-1" style={{ scrollSnapType: 'x proximity', scrollbarWidth: 'none' }}>
                    {cat.items.map((item) => (
                      <div key={item.id} style={{ scrollSnapAlign: 'start' }}>
                        <FoodCard item={item} carousel />
                      </div>
                    ))}
                  </div>
                </section>
              )
            ))}
          </div>
        ) : (
          /* ── Modo filtro: só a categoria seleccionada, grid vertical ── */
          (() => {
            const cat = categories.find((c) => c.id === activeCategory);
            if (!cat) return null;
            return (
              <div className="pt-4">
                <div className="flex items-center justify-between px-4 mb-4">
                  <span className="text-white font-bold text-base">{cat.name}</span>
                  <button
                    onClick={() => setActiveCategory(null)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                    style={{ border: '1px solid var(--st-line)', color: 'var(--st-muted)' }}
                  >
                    ✕ Ver tudo
                  </button>
                </div>
                <div className="flex flex-col gap-0 px-4">
                  {cat.items.map((item) => <ListCard key={item.id} item={item} />)}
                </div>
              </div>
            );
          })()
        )}
      </div>

      {/* Barra flutuante do carrinho */}
      {count > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="glass-cta fixed bottom-[88px] left-1/2 -translate-x-1/2 z-20 w-[calc(100%-2rem)] max-w-[448px] text-white font-bold py-3.5 px-5 rounded-2xl flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <span className="bg-black/30 rounded-full w-6 h-6 grid place-items-center text-sm">{count}</span>
            Ver carrinho
          </span>
          <span>{mt(subtotal)}</span>
        </button>
      )}

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 z-20 w-full max-w-[480px] flex" style={{ background: '#0f0f0f', borderTop: '1px solid var(--st-line)', paddingBottom: 18 }}>
        {NAV.map((n) => (
          <button key={n.id} onClick={n.onClick} className="flex-1 flex flex-col items-center gap-1 pt-2.5 pb-1.5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={n.active ? 'var(--st-primary)' : '#555'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={n.path} /></svg>
            <span className="text-[10px]" style={{ color: n.active ? 'var(--st-primary)' : '#555', fontWeight: n.active ? 700 : 400 }}>{n.label}</span>
          </button>
        ))}
      </nav>

      {/* Drawer do carrinho */}
      {cartOpen && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCartOpen(false)} />
          <div className="relative rounded-t-3xl max-h-[85vh] flex flex-col w-full max-w-[480px] mx-auto" style={{ background: 'var(--st-card)', borderTop: '1px solid var(--st-line)' }}>
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--st-line)' }}>
              <h2 className="text-white font-bold text-lg">Meu Carrinho</h2>
              <button onClick={() => setCartOpen(false)} className="text-xl" style={{ color: 'var(--st-muted)' }} aria-label="Fechar">✕</button>
            </div>

            <div className="overflow-y-auto p-4 space-y-3 flex-1">
              {cart.length === 0 && <p className="text-center py-8" style={{ color: 'var(--st-muted)' }}>Carrinho vazio</p>}
              {cart.map((line, idx) => {
                const isGift = giftItemIds.has(line.menuItemId);
                const it = lineDetail(line.menuItemId);
                if (!it && !isGift) return null;

                if (isGift) {
                  return (
                    <div key={idx} className="flex items-center gap-3 rounded-2xl p-3" style={{ background: '#0f2a1a', border: '1px solid #22c55e44' }}>
                      <div className="w-14 h-14 rounded-xl grid place-items-center text-3xl shrink-0" style={{ background: '#163d24' }}>🎁</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold truncate">{refResult?.gift_item_name ?? 'Brinde'}</p>
                        <p className="text-sm font-bold" style={{ color: '#22c55e' }}>GRÁTIS</p>
                      </div>
                      <button onClick={() => setQtyByIndex(idx, 0)} className="w-6 h-6 grid place-items-center text-sm" style={{ color: 'var(--st-muted)' }} aria-label="Remover brinde">✕</button>
                    </div>
                  );
                }

                const variant = line.variantId ? it!.variants?.find((v) => v.id === line.variantId) : undefined;
                const addons = (it!.addons ?? []).filter((a) => (line.addonIds ?? []).includes(a.id));
                const unit = lineUnitPrice(it!, line.variantId, line.addonIds);
                return (
                  <div key={idx} className="flex items-center gap-3 rounded-2xl p-3" style={{ background: '#111', border: '1px solid var(--st-line)' }}>
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0">
                      <Image src={imgFor(it!, globalIndex(it!.id))} alt={it!.name} fill sizes="56px" className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold truncate">{it!.name}</p>
                      {(variant || addons.length > 0) && (
                        <p className="text-[11px] truncate" style={{ color: 'var(--st-muted)' }}>
                          {[variant?.name, ...addons.map((a) => a.name)].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <p className="text-sm" style={{ color: 'var(--st-primary)' }}>{mt(unit * line.qty)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full px-1 py-0.5 shrink-0" style={{ background: '#111', border: '1px solid var(--st-line)' }}>
                      <button onClick={() => setQtyByIndex(idx, line.qty - 1)} className="w-6 h-6 grid place-items-center text-white font-bold" aria-label="Diminuir">−</button>
                      <span className="text-white text-sm font-bold w-4 text-center">{line.qty}</span>
                      <button onClick={() => setQtyByIndex(idx, line.qty + 1)} className="w-6 h-6 grid place-items-center font-bold" style={{ color: 'var(--st-primary)' }} aria-label="Aumentar">+</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t space-y-3" style={{ borderColor: 'var(--st-line)' }}>
              <div className="flex justify-between text-white">
                <span style={{ color: 'var(--st-muted)' }}>Subtotal</span>
                <span className="font-bold">{mt(subtotal)}</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--st-muted)' }}>Taxa de entrega calculada no checkout.</p>
              <div className="flex gap-2">
                <button onClick={() => { clear(); setCartOpen(false); }} className="px-4 py-3 rounded-2xl text-sm" style={{ border: '1px solid var(--st-line)', color: 'var(--st-muted-2)' }}>Limpar</button>
                <button onClick={() => router.push('/checkout')} disabled={cart.length === 0} className="flex-1 text-white font-bold py-3 px-4 rounded-2xl disabled:opacity-50" style={{ background: 'var(--st-grad)' }}>Finalizar pedido</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Produto (F2) — overlay full-screen, fiel ao schema plano (sem variantes) */}
      {product && (
        <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="mx-auto w-full max-w-[480px] h-full flex flex-col" style={{ background: 'var(--st-bg)' }}>
            {/* hero */}
            <div className="relative h-[280px] shrink-0">
              <Image src={imgFor(product, globalIndex(product.id))} alt={product.name} fill sizes="(max-width:480px) 100vw, 480px" className="object-cover" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 40%, rgba(10,5,2,0.7) 100%)' }} />
              <button onClick={() => setProduct(null)} className="absolute top-3 left-3.5 w-9 h-9 rounded-full grid place-items-center text-white text-xl" style={{ background: 'rgba(0,0,0,0.5)' }} aria-label="Voltar">‹</button>
              <button onClick={() => toggleFav(product.id)} className="absolute top-3 right-3.5 w-9 h-9 rounded-full grid place-items-center text-lg" style={{ background: 'rgba(0,0,0,0.5)', color: favorites.has(product.id) ? 'var(--st-primary)' : '#ddd' }} aria-label="Favorito">{favorites.has(product.id) ? '♥' : '♡'}</button>
            </div>

            {/* conteúdo */}
            <div className="flex-1 overflow-y-auto px-5 pt-5">
              <h2 className="text-white font-black text-[28px] leading-tight mb-2">{product.name}</h2>
              {categoryOf(product.id) && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 mb-3 text-[11.5px] font-bold" style={{ background: 'rgba(255,95,48,0.13)', border: '1px solid rgba(255,95,48,0.3)', color: '#ff6535' }}>🔥 {categoryOf(product.id)}</span>
              )}
              {product.description && <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--st-muted-2)' }}>{product.description}</p>}

              {/* Tamanho (variantes) — escolha única. Só aparece se o item tiver variantes. */}
              {product.variants && product.variants.length > 0 && (
                <div className="mb-5">
                  <p className="text-white font-bold text-sm mb-2.5">Escolha o tamanho</p>
                  <div className="space-y-2" style={{ perspective: '1000px' }}>
                    {product.variants.map((v) => {
                      const sel = selVariant === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelVariant(v.id)}
                          aria-pressed={sel}
                          className={`glass-opt w-full flex items-center justify-between px-4 py-3${sel ? ' is-selected' : ''}`}
                        >
                          <span className="glass-label text-sm">{v.name}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-white font-bold text-sm">{mt(v.price_cents)}</span>
                            {sel && <span className="w-5 h-5 rounded-full grid place-items-center text-white text-[11px] font-bold" style={{ background: 'var(--st-grad)' }}>✓</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Adicionais — multi-seleção (upsell). Só aparece se o item tiver adicionais. */}
              {product.addons && product.addons.length > 0 && (
                <div className="mb-5">
                  <p className="text-white font-bold text-sm mb-2.5">Adicionais</p>
                  <div className="flex flex-wrap gap-2" style={{ perspective: '1000px' }}>
                    {product.addons.map((a) => {
                      const sel = selAddons.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setSelAddons((prev) => sel ? prev.filter((x) => x !== a.id) : [...prev, a.id])}
                          aria-pressed={sel}
                          className={`glass-opt pill px-3.5 py-2 text-[12.5px]${sel ? ' is-selected' : ''}`}
                        >
                          <span className="glass-label">{sel ? '✓ ' : '+ '}{a.name}</span>
                          <span className="ml-1" style={{ color: 'var(--st-primary)' }}>+{mt(a.price_cents)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-baseline gap-1 mb-5">
                <span className="text-white font-black text-4xl">{mt(lineUnitPrice(product, selVariant, selAddons))}</span>
              </div>
            </div>

            {/* barra adicionar */}
            <div className="shrink-0 flex items-center gap-3 px-4 pt-2.5 pb-4 border-t" style={{ borderColor: 'var(--st-line)' }}>
              <div className="flex items-center rounded-xl overflow-hidden" style={{ background: 'var(--st-card)', border: '1px solid var(--st-line)' }}>
                <button onClick={() => setProductQty((q) => Math.max(1, q - 1))} className="w-10 h-11 grid place-items-center text-white text-xl" aria-label="Diminuir">−</button>
                <span className="w-6 text-center text-white font-extrabold">{productQty}</span>
                <button onClick={() => setProductQty((q) => q + 1)} className="w-10 h-11 grid place-items-center text-white text-xl" aria-label="Aumentar">+</button>
              </div>
              <button
                onClick={() => {
                  const unit = lineUnitPrice(product, selVariant, selAddons);
                  add(product.id, productQty, { variantId: selVariant, addonIds: selAddons });
                  trackAddToCart({ id: product.id, name: product.name, price_cents: unit, qty: productQty });
                  const name = product.name;
                  setProduct(null);
                  setToast(`${productQty}× ${name} no carrinho`);
                }}
                className="flex-1 h-11 rounded-xl text-white font-extrabold text-[12.5px] tracking-wide grid place-items-center"
                style={{ background: 'var(--st-grad)' }}
              >ADICIONAR AO CARRINHO 🛒</button>
            </div>
          </div>
        </div>
      )}

      {/* Conta (F7): identificar / Meus Pedidos / Perfil */}
      {account === 'identify' && <IdentifyModal onClose={() => setAccount(null)} onSubmit={onIdentified} />}
      {account === 'orders' && (
        <OrdersOverlay orders={myOrders} onClose={() => setAccount(null)} onOpen={(id) => router.push(`/order-status/${id}`)} onReorder={reorder} />
      )}
      {account === 'profile' && customer && (
        <ProfileOverlay customer={customer} onClose={() => setAccount(null)} onLogout={logout} onReorder={reorder}
          onOrders={() => { setAccount('orders'); if (phone) loadMyOrders(phone); }} />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-[96px] left-1/2 -translate-x-1/2 z-[60] rounded-full px-4 py-2 text-sm text-white" style={{ background: 'rgba(0,0,0,0.85)', border: '1px solid var(--st-line)' }}>
          {toast}
        </div>
      )}
    </Shell>
  );
}

// Coluna app centrada (mobile-first; centrada no desktop)
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[480px] min-h-screen" style={{ background: 'var(--st-bg)', fontFamily: 'var(--font-store)' }}>
      {children}
    </div>
  );
}

// ── Conta (F7): wrapper de overlay full-screen ────────────────────────────────
function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="mx-auto w-full max-w-[480px] h-full flex flex-col" style={{ background: 'var(--st-bg)' }}>
        <header className="flex items-center gap-3 px-4 py-4 border-b shrink-0" style={{ borderColor: 'var(--st-line)' }}>
          <button onClick={onClose} className="text-2xl text-white leading-none" aria-label="Voltar">←</button>
          <h1 className="text-xl font-extrabold text-white">{title}</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// Identificação soft (telefone, sem OTP). DECISÃO: só mostramos resumos deste telefone (CLAUDE §9).
function IdentifyModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (phone: string, name?: string) => void | Promise<void> }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const input = 'w-full rounded-xl p-3 text-white placeholder:text-[var(--st-muted)] focus:outline-none focus:border-[var(--st-primary)] border border-[var(--st-line)] bg-black/30';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.trim().length < 6) return;
    setBusy(true);
    await onSubmit(phone.trim(), name.trim() || undefined);
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[4px] flex items-end sm:items-center justify-center">
      <div className="w-full max-w-[480px] rounded-t-3xl sm:rounded-3xl p-6" style={{ background: 'var(--st-card)', border: '1px solid var(--st-line)' }}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-white font-extrabold text-xl">Entrar</h2>
          <button onClick={onClose} className="text-xl" style={{ color: 'var(--st-muted)' }} aria-label="Fechar">✕</button>
        </div>
        <p className="text-sm mb-5" style={{ color: 'var(--st-muted)' }}>Identifica-te com o teu telefone para veres os teus pedidos e favoritos.</p>
        <form onSubmit={submit} className="space-y-3">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="Telefone (+258 …)" className={input} required />
          <input value={name} onChange={(e) => setName(e.target.value)} type="text" placeholder="Nome (opcional)" className={input} />
          <button type="submit" disabled={busy || phone.trim().length < 6} className="w-full text-white font-extrabold py-3.5 rounded-2xl disabled:opacity-50" style={{ background: 'var(--st-grad)' }}>{busy ? 'A entrar…' : 'Entrar'}</button>
          <button type="button" onClick={onClose} className="w-full py-2 text-sm" style={{ color: 'var(--st-muted)' }}>Agora não</button>
        </form>
      </div>
    </div>
  );
}

// Meus Pedidos (resumos por telefone; "pedir de novo")
function OrdersOverlay({ orders, onClose, onOpen, onReorder }: { orders: CustomerOrder[] | null; onClose: () => void; onOpen: (id: string) => void; onReorder: (items: ReorderItem[]) => void }) {
  const all = orders ?? [];
  const active = all.filter((o) => isActiveOrder(o.status));
  const history = all.filter((o) => !isActiveOrder(o.status));
  const Card = (o: CustomerOrder) => {
    const m = ORDER_STATUS[o.status] ?? { label: o.status, color: '#888' };
    return (
      <div key={o.id} className="rounded-2xl p-3.5" style={{ background: 'var(--st-card)', border: '1px solid var(--st-line)' }}>
        <div className="flex items-start justify-between">
          <button onClick={() => onOpen(o.id)} className="text-left">
            <div className="font-mono font-bold text-white">{o.order_number}</div>
            <div className="text-[11px]" style={{ color: 'var(--st-muted)' }}>
              {new Date(o.created_at).toLocaleDateString('pt-MZ', { day: '2-digit', month: 'short', year: 'numeric' })} · {o.items.reduce((s, it) => s + it.qty, 0)} itens
            </div>
          </button>
          <span className="text-xs font-bold inline-flex items-center gap-1.5" style={{ color: m.color }}><span className="w-2 h-2 rounded-full bg-current" />{m.label}</span>
        </div>
        <div className="flex items-center justify-between mt-2.5">
          <span className="text-white font-extrabold">{mt(o.total_cents)}</span>
          <div className="flex gap-2">
            <button onClick={() => onOpen(o.id)} className="text-xs font-semibold rounded-xl px-3 py-1.5" style={{ border: '1px solid var(--st-line)', color: 'var(--st-muted-2)' }}>Acompanhar</button>
            <button onClick={() => onReorder(o.items)} className="text-xs font-semibold rounded-xl px-3 py-1.5 text-white" style={{ background: 'var(--st-grad)' }}>↻ Repetir</button>
          </div>
        </div>
      </div>
    );
  };
  return (
    <Overlay title="Meus Pedidos" onClose={onClose}>
      {orders === null ? (
        <p className="text-center py-10" style={{ color: 'var(--st-muted)' }}>A carregar…</p>
      ) : all.length === 0 ? (
        <p className="text-center py-10" style={{ color: 'var(--st-muted)' }}>Ainda não há pedidos com este telefone.</p>
      ) : (
        <div className="space-y-5">
          {active.length > 0 && <div><h3 className="text-white font-bold mb-2">Ativos</h3><div className="space-y-2.5">{active.map(Card)}</div></div>}
          {history.length > 0 && <div><h3 className="text-white font-bold mb-2">Histórico</h3><div className="space-y-2.5">{history.map(Card)}</div></div>}
        </div>
      )}
    </Overlay>
  );
}

// Perfil (resumo + favoritos + sair)
function ProfileOverlay({ customer, onClose, onLogout, onOrders, onReorder }: { customer: CustomerSummary; onClose: () => void; onLogout: () => void; onOrders: () => void; onReorder: (items: ReorderItem[]) => void }) {
  const initial = (customer.name || customer.phone || '?').trim()[0]?.toUpperCase() ?? '?';
  return (
    <Overlay title="Perfil" onClose={onClose}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-14 h-14 rounded-full grid place-items-center text-white text-xl font-extrabold" style={{ background: 'var(--st-grad)' }}>{initial}</div>
        <div>
          <div className="text-white font-extrabold text-lg">{customer.name || 'Cliente'}</div>
          <div className="text-sm" style={{ color: 'var(--st-muted)' }}>{customer.phone}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-2xl p-3.5 text-center" style={{ background: 'var(--st-card)', border: '1px solid var(--st-line)' }}>
          <div className="text-white font-extrabold text-xl">{customer.orders_count}</div>
          <div className="text-[11px]" style={{ color: 'var(--st-muted)' }}>Pedidos</div>
        </div>
        <div className="rounded-2xl p-3.5 text-center" style={{ background: 'var(--st-card)', border: '1px solid var(--st-line)' }}>
          <div className="text-white font-extrabold text-xl">{mt(customer.total_spent_cents)}</div>
          <div className="text-[11px]" style={{ color: 'var(--st-muted)' }}>Total gasto</div>
        </div>
      </div>
      {customer.favorites.length > 0 && (
        <div className="mb-5">
          <h3 className="text-white font-bold mb-2">Os teus favoritos</h3>
          <div className="space-y-2">
            {customer.favorites.map((f) => (
              <div key={f.menu_item_id} className="flex items-center justify-between rounded-xl p-2.5" style={{ background: 'var(--st-card)', border: '1px solid var(--st-line)' }}>
                <span className="text-white text-sm">{f.name}</span>
                <button onClick={() => onReorder([{ menu_item_id: f.menu_item_id, qty: 1 }])} className="text-xs font-semibold rounded-xl px-3 py-1.5 text-white" style={{ background: 'var(--st-grad)' }}>+ Adicionar</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <button onClick={onOrders} className="w-full rounded-2xl py-3.5 font-semibold mb-2.5 text-white" style={{ background: 'var(--st-card)', border: '1px solid var(--st-line)' }}>Ver os meus pedidos</button>
      <button onClick={onLogout} className="w-full rounded-2xl py-3.5 font-semibold" style={{ border: '1px solid var(--st-line)', color: 'var(--st-muted)' }}>Sair</button>
    </Overlay>
  );
}

// Loja fechada — lista de espera (reskin The Box)
function WaitlistForm() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) { setError('Por favor, preencha o nome e o telefone'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, notes }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Erro ao adicionar à lista de espera');
      setSubmitted(true);
      trackLead();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar à lista de espera');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full rounded-xl p-3 text-white placeholder-gray-500 focus:outline-none';
  const inputStyle = { background: '#111', border: '1px solid var(--st-line)' } as React.CSSProperties;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full">
        <div className="rounded-3xl p-6" style={{ background: 'var(--st-card)', border: '1px solid var(--st-line)' }}>
          <div className="text-center mb-6">
            <div className="font-black text-sm tracking-[2px] text-white border-2 border-white rounded-md px-2.5 py-1 inline-block mb-4">{ST.logoText}</div>
            <h1 className="text-2xl font-bold text-white mb-2">Loja Fechada</h1>
            <p style={{ color: 'var(--st-muted)' }}>Deixe o seu contacto e avisamos quando abrirmos!</p>
          </div>
          {submitted ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <p className="text-lg font-semibold" style={{ color: 'var(--st-primary)' }}>Adicionado à lista de espera!</p>
              <p className="mt-2" style={{ color: 'var(--st-muted)' }}>Avisaremos quando a loja abrir.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" className={inputCls} style={inputStyle} required />
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+258 84 123 4567" className={inputCls} style={inputStyle} required />
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Alguma observação? (opcional)" rows={3} className={inputCls} style={inputStyle} />
              {error && (
                <div className="rounded-xl p-3" style={{ background: 'rgba(232,23,77,0.1)', border: '1px solid rgba(232,23,77,0.3)' }}>
                  <p className="text-sm text-center" style={{ color: 'var(--st-primary)' }}>{error}</p>
                </div>
              )}
              <button type="submit" disabled={submitting || !name || !phone} className="w-full text-white font-bold py-3 px-4 rounded-2xl disabled:opacity-50" style={{ background: 'var(--st-grad)' }}>
                {submitting ? 'A enviar…' : 'Adicionar à Lista'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
