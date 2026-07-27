'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { formatMT, type Cents } from '@delivery/core';
import { useCart } from '@/utils/useCart';
import { useBodyScrollLock } from '@/utils/useBodyScrollLock';
import { createClient } from '@/utils/supabase/client';
import { trackViewMenu, trackViewItem, trackAddToCart, trackLead, trackCouponApplied, trackBannerClick, type TrackItem } from '@/lib/analytics/track';
import { brand } from '@brand';
import type { MenuItem, Category, Banner } from './menu-types';
import { SmartImage } from './menu-ui';
import ProductDetail, { type AddToCartPayload } from './ProductDetail';

const mt = (cents: number) => formatMT(cents as Cents);
const ST = brand.storefront;

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

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

// preço unitário de uma linha = (variante ou base) + Σ adicionais (PREVIEW; servidor é a verdade).
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

type SortMode = 'featured' | 'price_asc' | 'price_desc' | 'new';

const FAV_KEY = 'fav_items';
const DL_PHONE_KEY = 'dl_phone';

const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  awaiting_approval: { label: 'Aguarda aprovação', color: '#b7791f' },
  awaiting_payment: { label: 'Aguarda pagamento', color: '#b7791f' },
  paid: { label: 'Pago', color: '#2563eb' },
  approved: { label: 'Aceite', color: '#16a34a' },
  in_preparation: { label: 'Em preparo', color: '#b7791f' },
  ready: { label: 'Pronto', color: '#7c3aed' },
  delivered: { label: 'Entregue', color: '#16a34a' },
  cancelled: { label: 'Cancelado', color: '#dc2626' },
  payment_failed: { label: 'Falhou', color: '#dc2626' },
};
const isActiveOrder = (s: string) => ['awaiting_approval', 'awaiting_payment', 'paid', 'approved', 'in_preparation', 'ready'].includes(s);

export default function MenuPage() {
  const router = useRouter();
  const [cartOpen, setCartOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [product, setProduct] = useState<MenuItem | null>(null);
  const [account, setAccount] = useState<'identify' | 'orders' | 'profile' | null>(null);

  // ── PLP: busca / filtros / ordenação ──────────────────────────────────────
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('featured');
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [variantFacet, setVariantFacet] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  const { cart, add, setQtyByIndex, count, clear } = useCart();
  const supabase = createClient();

  // Trava o scroll da Home enquanto a sacola ou um overlay de conta estiver aberto
  // (sem isto, arrastar no drawer/overlay rola a página por baixo).
  useBodyScrollLock(cartOpen || account !== null);

  const { data: menuData, isLoading, error } = useQuery({
    queryKey: ['menu'],
    queryFn: async () => {
      const response = await fetch('/api/menu');
      if (!response.ok) throw new Error('Failed to fetch menu');
      return response.json();
    },
  });

  const categories: Category[] = useMemo(() => menuData?.categories || [], [menuData]);
  const banners: Banner[] = useMemo(() => menuData?.banners || [], [menuData]);
  const acceptingOrders = menuData?.accepting_orders ?? true;
  const promoBannerUrl: string | null = menuData?.promo_banner_url ?? null;
  const promoCode: string | null = menuData?.promo_code ?? null;

  const [promoDismissed, setPromoDismissed] = useState(false);
  const [promoCopied, setPromoCopied] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('promo_dismissed')) setPromoDismissed(true);
  }, []);
  const dismissPromo = () => { setPromoDismissed(true); sessionStorage.setItem('promo_dismissed', '1'); };
  const copyPromoCode = () => {
    if (!promoCode) return;
    navigator.clipboard.writeText(promoCode).then(() => { setPromoCopied(true); setTimeout(() => setPromoCopied(false), 2000); });
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
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      return next;
    });

  // toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // view_menu — uma vez quando o catálogo carrega
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current || !menuData?.categories) return;
    viewedRef.current = true;
    const flat: TrackItem[] = menuData.categories.flatMap((c: Category) =>
      (c.items || []).map((i) => ({ id: i.id, name: i.name, price_cents: i.price_cents })),
    );
    if (flat.length) trackViewMenu(flat);
  }, [menuData]);

  const allItems: MenuItem[] = useMemo(() => categories.flatMap((c) => c.items), [categories]);
  const lineDetail = (id: string) => allItems.find((i) => i.id === id);
  const categoryOf = (id: string) => categories.find((c) => c.items.some((i) => i.id === id))?.name ?? '';

  function quickAdd(item: MenuItem) {
    add(item.id);
    trackAddToCart({ id: item.id, name: item.name, price_cents: item.price_cents, qty: 1 });
    setToast('Adicionado à sacola');
  }

  function openProduct(item: MenuItem) {
    setProduct(item);
    trackViewItem({ id: item.id, name: item.name, price_cents: item.price_cents });
  }
  const openProductById = (id: string) => { const it = allItems.find((i) => i.id === id); if (it) openProduct(it); };

  // Clique num banner (F10+): leva à categoria (filtra a PLP) ou a um link externo/custom.
  function openBanner(b: Banner) {
    trackBannerClick(b.id);
    if (b.category_id) {
      setActiveCategory(b.category_id);
      document.getElementById('plp-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (b.custom_url) {
      if (/^https?:\/\//.test(b.custom_url)) window.open(b.custom_url, '_blank', 'noopener,noreferrer');
      else router.push(b.custom_url);
    }
  }

  function onAddFromPDP(p: AddToCartPayload) {
    if (!product) return;
    add(product.id, p.qty, { variantId: p.variantId, addonIds: p.addonIds });
    trackAddToCart({ id: product.id, name: product.name, price_cents: p.unitPriceCents, qty: p.qty });
    setToast(`${p.qty}× ${product.name} na sacola`);
  }

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
    setAccount(null); setCartOpen(true); setToast('Itens adicionados à sacola');
  };
  const openOrders = () => { if (phone) { setAccount('orders'); loadMyOrders(phone); } else { setIdentifyNext('orders'); setAccount('identify'); } };
  const openProfile = () => { if (phone) setAccount('profile'); else { setIdentifyNext('profile'); setAccount('identify'); } };
  const onIdentified = async (p: string, name?: string) => {
    if (!(await identify(p, name))) return;
    if (identifyNext === 'orders') { setAccount('orders'); loadMyOrders(p); } else setAccount('profile');
  };

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(DL_PHONE_KEY) : null;
    if (saved) { setPhone(saved); identify(saved); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const savedCode = localStorage.getItem(REFERRAL_KEY);
    const savedResult = localStorage.getItem(REFERRAL_RESULT_KEY);
    if (savedCode && savedResult) {
      try {
        const parsed = JSON.parse(savedResult) as ReferralResult;
        setAppliedCode(savedCode); setRefResult(parsed); setRefInput(savedCode);
        if (parsed.gift_item_id) setGiftItemIds(new Set([parsed.gift_item_id]));
      } catch { /* ignora */ }
    }
  }, []);

  const applyReferral = async () => {
    const code = refInput.trim().toUpperCase();
    if (!code) return;
    setRefLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('validate_referral', { p_code: code, p_phone: phone ?? '' });
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
          add(result.gift_item_id, 1);
          setToast('🎁 Código aplicado! O seu presente foi adicionado à sacola.');
        } else {
          setToast('Código aplicado! Desconto activo no checkout.');
        }
      }
    } finally {
      setRefLoading(false);
    }
  };
  const removeReferral = () => {
    setAppliedCode(null); setRefResult(null); setRefInput(''); setGiftItemIds(new Set());
    localStorage.removeItem(REFERRAL_KEY); localStorage.removeItem(REFERRAL_RESULT_KEY);
  };

  // ── PLP: cálculo de bounds e opções de filtro ─────────────────────────────
  const priceBounds = useMemo(() => {
    if (allItems.length === 0) return { min: 0, max: 0 };
    const prices = allItems.map((i) => i.price_cents);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [allItems]);

  const variantNames = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((i) => (i.variants ?? []).forEach((v) => set.add(v.name)));
    return [...set];
  }, [allItems]);

  const filtersActive = Boolean(search.trim()) || activeCategory !== null || sortMode !== 'featured' || priceMax !== null || variantFacet !== null;

  const filteredItems = useMemo(() => {
    let items = allItems;
    if (activeCategory) items = categories.find((c) => c.id === activeCategory)?.items ?? [];
    const q = norm(search.trim());
    if (q) items = items.filter((i) => norm(i.name).includes(q) || (i.description ? norm(i.description).includes(q) : false));
    if (priceMax !== null) items = items.filter((i) => i.price_cents <= priceMax);
    if (variantFacet) items = items.filter((i) => (i.variants ?? []).some((v) => v.name === variantFacet));

    const idx = (i: MenuItem) => allItems.findIndex((x) => x.id === i.id);
    const sorted = [...items];
    if (sortMode === 'price_asc') sorted.sort((a, b) => a.price_cents - b.price_cents);
    else if (sortMode === 'price_desc') sorted.sort((a, b) => b.price_cents - a.price_cents);
    else if (sortMode === 'new') sorted.sort((a, b) => idx(b) - idx(a)); // proxy de "novidades" (sem timestamp no payload)
    return sorted;
  }, [allItems, categories, activeCategory, search, priceMax, variantFacet, sortMode]);

  const clearFilters = () => { setSearch(''); setActiveCategory(null); setSortMode('featured'); setPriceMax(null); setVariantFacet(null); };

  const subtotal = cart.reduce((s, l) => {
    const it = lineDetail(l.menuItemId);
    return s + (it ? lineUnitPrice(it, l.variantId, l.addonIds) : 0) * l.qty;
  }, 0);

  if (!acceptingOrders) return <Shell><WaitlistForm /></Shell>;

  if (isLoading) {
    return (
      <Shell>
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="text-center">
            <div className="mx-auto mb-4 h-7 w-7 animate-spin rounded-full border-b-2" style={{ borderColor: 'var(--st-primary)' }} />
            <p style={{ color: 'var(--st-muted)' }}>A carregar a loja…</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="text-center">
            <p className="mb-2" style={{ color: 'var(--st-text)' }}>Erro ao carregar a loja</p>
            <button onClick={() => window.location.reload()} className="underline" style={{ color: 'var(--st-primary-2)' }}>Tentar novamente</button>
          </div>
        </div>
      </Shell>
    );
  }

  const NAV = [
    { id: 'home', label: 'Loja', onClick: () => { clearFilters(); window.scrollTo({ top: 0, behavior: 'smooth' }); }, active: true, path: 'M4 10.5 12 4l8 6.5M6 9.5V20h12V9.5' },
    { id: 'search', label: 'Explorar', onClick: () => { setFiltersOpen(false); document.getElementById('plp-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, path: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3' },
    { id: 'orders', label: 'Pedidos', onClick: openOrders, path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { id: 'perfil', label: 'Perfil', onClick: openProfile, path: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z' },
  ];

  return (
    <Shell>
      <div className="pb-28 md:pb-16">
        {/* Header */}
        <header className="flex items-center justify-between px-5 pb-3 pt-5 md:px-8 md:pt-6 lg:px-12">
          <div className="text-[19px] font-semibold tracking-[0.32em] md:text-[22px]">{ST.logoText}</div>
          <div className="flex items-center gap-1">
            {/* Ações de conta — só desktop (no mobile vivem na bottom-nav) */}
            <button onClick={openOrders} className="hidden h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium md:flex" style={{ color: 'var(--st-muted-2)' }}>
              <NavIcon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              Pedidos
            </button>
            <button onClick={openProfile} className="hidden h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium md:flex" style={{ color: 'var(--st-muted-2)' }}>
              <NavIcon path="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
              Perfil
            </button>
            <button onClick={() => { setFiltersOpen(false); document.getElementById('plp-search')?.focus(); }} className="grid h-10 w-10 place-items-center rounded-full" aria-label="Pesquisar">
              <NavIcon path="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3" active />
            </button>
            <button onClick={() => setCartOpen(true)} className="relative grid h-10 w-10 place-items-center rounded-full" aria-label="Sacola">
              <NavIcon path="M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 016 0v2" active />
              {count > 0 && (
                <span className="absolute -right-0 -top-0 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: 'var(--st-primary)' }}>{count}</span>
              )}
            </button>
          </div>
        </header>

        {/* Hero — robusto a imagem ausente (gradiente + tipografia) */}
        <section className="px-5 md:px-8 lg:px-12">
          <div className="relative overflow-hidden rounded-3xl aspect-[3/4] max-h-[460px] md:aspect-[21/9] md:max-h-[420px]">
            <SmartImage src={ST.hero.image} alt={brand.name} monogram={brand.name} rounded="rounded-3xl" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.45) 100%)' }} />
            <div className="absolute inset-x-0 bottom-0 p-6 md:p-10">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/85">{brand.tagline}</p>
              <h1 className="mb-4 max-w-[15ch] text-[30px] font-semibold leading-[1.05] text-white md:text-[42px]" style={{ textWrap: 'balance' } as React.CSSProperties}>{ST.hero.title}</h1>
              <button
                onClick={() => document.getElementById('plp-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="inline-flex items-center rounded-full bg-white px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--st-text)' }}
              >
                {ST.hero.cta}
              </button>
            </div>
          </div>
          {ST.hero.subtitle && (
            <p className="mt-4 text-center text-[13px] leading-relaxed" style={{ color: 'var(--st-muted-2)' }}>{ST.hero.subtitle}</p>
          )}
        </section>

        {/* Banners de categoria (F10+): carrossel rotativo, transições variadas, métrica de clique */}
        {banners.length > 0 && (
          <section className="mt-7 px-5 md:px-8 lg:px-12">
            <BannerCarousel banners={banners} onOpen={openBanner} />
          </section>
        )}

        {/* Cupom promocional (opcional, admin) */}
        {(promoBannerUrl || promoCode) && !promoDismissed && (
          <div className="px-5 pt-5 md:px-8 lg:px-12">
            <div className="flex items-stretch overflow-hidden rounded-2xl" style={{ border: '1px solid var(--st-line)' }}>
              {promoBannerUrl && (
                <div className="relative w-24 shrink-0"><SmartImage src={promoBannerUrl} alt="Cupom" /></div>
              )}
              <div className="min-w-0 flex-1 p-3.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--st-muted)' }}>Cupom</p>
                {promoCode && (
                  <button onClick={copyPromoCode} className="mb-1 inline-flex items-center gap-2 rounded-lg px-2.5 py-1" style={{ border: '1px solid var(--st-line)' }} aria-label="Copiar código">
                    <span className="font-mono text-sm font-semibold tracking-wider">{promoCode}</span>
                    <span className="text-[13px]" style={{ color: 'var(--st-primary-2)' }}>{promoCopied ? '✓' : '⧉'}</span>
                  </button>
                )}
                <p className="text-[10.5px] leading-tight" style={{ color: 'var(--st-muted)' }}>Válido apenas na primeira compra. Não cumulativo.</p>
              </div>
              <button onClick={dismissPromo} className="w-9 shrink-0" style={{ color: 'var(--st-muted)' }} aria-label="Fechar">✕</button>
            </div>
          </div>
        )}

        {/* Barra de código de amigo (F5.2) */}
        <div className="px-5 pt-5 md:px-8 lg:px-12">
          {appliedCode ? (
            <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: '#f2f8f3', border: '1px solid #cfe6d4' }}>
              <div className="flex min-w-0 items-center gap-2">
                <span style={{ color: '#16a34a' }}>✓</span>
                <div className="min-w-0">
                  <span className="text-sm font-semibold" style={{ color: '#15803d' }}>{appliedCode}</span>
                  {refResult?.reward_type === 'discount_cents' && <span className="block text-[11px]" style={{ color: 'var(--st-muted)' }}>Desconto: -{mt(refResult.reward_value ?? 0)}</span>}
                  {refResult?.reward_type === 'discount_pct' && <span className="block text-[11px]" style={{ color: 'var(--st-muted)' }}>Desconto: -{refResult.reward_value}%</span>}
                  {refResult?.reward_type === 'free_item' && <span className="block text-[11px]" style={{ color: 'var(--st-muted)' }}>🎁 {refResult.gift_item_name ?? 'Brinde'} na sacola</span>}
                </div>
              </div>
              <button onClick={removeReferral} className="ml-3 shrink-0 text-sm" style={{ color: 'var(--st-muted)' }} aria-label="Remover código">✕</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text" value={refInput}
                onChange={(e) => setRefInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && applyReferral()}
                placeholder="Código de amigo"
                maxLength={50}
                className="flex-1 rounded-full px-4 py-2.5 text-sm focus:outline-none"
                style={{ border: '1px solid var(--st-line)', color: 'var(--st-text)' }}
                aria-label="Código de referral"
              />
              <button onClick={applyReferral} disabled={refLoading || !refInput.trim()} className="shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'var(--st-grad)' }}>
                {refLoading ? '…' : 'Aplicar'}
              </button>
            </div>
          )}
          {refResult && !refResult.valid && (
            <p className="mt-1.5 px-1 text-xs" style={{ color: '#dc2626' }}>
              {refResult.reason === 'auto_redemption' ? 'Não podes usar o teu próprio código.' :
               refResult.reason === 'already_redeemed' ? 'Já usaste este código antes.' :
               refResult.reason === 'max_redemptions_reached' ? 'Este código atingiu o limite.' :
               'Código inválido ou expirado.'}
            </p>
          )}
        </div>

        {/* SEU PRESENTE */}
        {refResult?.valid && refResult.reward_type === 'free_item' && refResult.gift_item_id && (
          <div className="px-5 pt-5 md:px-8 lg:px-12">
            <p className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.14em]">🎁 Seu presente</p>
            <div className="w-[150px] overflow-hidden rounded-2xl" style={{ border: '1px solid #cfe6d4' }}>
              <div className="relative" style={{ aspectRatio: '3 / 4', background: 'var(--st-card)' }}>
                <SmartImage src={refResult.gift_item_photo_url ?? null} alt={refResult.gift_item_name ?? 'Brinde'} monogram={refResult.gift_item_name ?? '🎁'} />
              </div>
              <div className="p-2.5">
                <div className="truncate text-[13px] font-medium">{refResult.gift_item_name ?? 'Brinde'}</div>
                <div className="mt-1 text-[13px] font-semibold" style={{ color: '#16a34a' }}>Grátis</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Toolbar PLP: busca + ordenação + filtros ── */}
        <div id="plp-toolbar" className="sticky top-0 z-10 mt-6 px-5 pb-3 pt-3 md:px-8 lg:px-12" style={{ background: 'var(--st-bg)', borderBottom: '1px solid var(--st-line)' }}>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-full px-4 py-2.5" style={{ border: '1px solid var(--st-line)' }}>
              <NavIcon path="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3" muted small />
              <input
                id="plp-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Procurar peças, fragrâncias…"
                className="w-full bg-transparent text-sm focus:outline-none"
                style={{ color: 'var(--st-text)' }}
                aria-label="Procurar"
              />
              {search && <button onClick={() => setSearch('')} aria-label="Limpar busca" style={{ color: 'var(--st-muted)' }}>✕</button>}
            </div>
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
              style={{ border: '1px solid var(--st-line)', background: filtersOpen || priceMax !== null || variantFacet ? 'var(--st-primary)' : 'transparent', color: filtersOpen || priceMax !== null || variantFacet ? '#fff' : 'var(--st-text)' }}
              aria-label="Filtros" aria-expanded={filtersOpen}
            >
              <NavIcon path="M4 6h16M7 12h10M10 18h4" active={filtersOpen || priceMax !== null || !!variantFacet} />
            </button>
          </div>

          {/* Chips de categoria */}
          {categories.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <Chip label="Tudo" active={activeCategory === null} onClick={() => setActiveCategory(null)} />
              {categories.filter((c) => c.items.length > 0).map((c) => (
                <Chip key={c.id} label={c.name} active={activeCategory === c.id} onClick={() => setActiveCategory((p) => (p === c.id ? null : c.id))} />
              ))}
            </div>
          )}

          {/* Painel de filtros */}
          {filtersOpen && (
            <div className="mt-3 space-y-4 rounded-2xl p-4" style={{ border: '1px solid var(--st-line)' }}>
              {/* Ordenação */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--st-muted-2)' }}>Ordenar</p>
                <div className="flex flex-wrap gap-2">
                  {([['featured', 'Destaques'], ['new', 'Novidades'], ['price_asc', 'Preço ↑'], ['price_desc', 'Preço ↓']] as [SortMode, string][]).map(([m, label]) => (
                    <Chip key={m} label={label} active={sortMode === m} onClick={() => setSortMode(m)} />
                  ))}
                </div>
              </div>

              {/* Faixa de preço */}
              {priceBounds.max > priceBounds.min && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--st-muted-2)' }}>Preço máx.</p>
                    <span className="text-[12px]" style={{ color: 'var(--st-muted)' }}>{mt(priceMax ?? priceBounds.max)}</span>
                  </div>
                  <input
                    type="range"
                    min={priceBounds.min}
                    max={priceBounds.max}
                    step={Math.max(100, Math.round((priceBounds.max - priceBounds.min) / 40))}
                    value={priceMax ?? priceBounds.max}
                    onChange={(e) => { const v = Number(e.target.value); setPriceMax(v >= priceBounds.max ? null : v); }}
                    className="w-full accent-[var(--st-primary)]"
                    aria-label="Preço máximo"
                  />
                </div>
              )}

              {/* Facet de variante (só se existir no catálogo) */}
              {variantNames.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--st-muted-2)' }}>Variante</p>
                  <div className="flex flex-wrap gap-2">
                    {variantNames.map((n) => (
                      <Chip key={n} label={n} active={variantFacet === n} onClick={() => setVariantFacet((p) => (p === n ? null : n))} />
                    ))}
                  </div>
                </div>
              )}

              {filtersActive && (
                <button onClick={clearFilters} className="text-[12px] font-semibold underline" style={{ color: 'var(--st-primary-2)' }}>Limpar filtros</button>
              )}
            </div>
          )}
        </div>

        {/* ── Vitrine: Home curada (sem filtros) OU grelha PLP (com filtros) ── */}
        {!filtersActive ? (
          <div className="space-y-9 pt-7">
            {categories.length === 0 && <p className="py-16 text-center" style={{ color: 'var(--st-muted)' }}>Coleção em breve.</p>}
            {categories.map((cat) => cat.items.length > 0 && (
              <section key={cat.id}>
                <div className="mb-3.5 flex items-end justify-between px-5 md:px-8 lg:px-12">
                  <h2 className="text-[17px] font-semibold tracking-tight md:text-[19px]">{cat.name}</h2>
                  <button onClick={() => setActiveCategory(cat.id)} className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--st-muted-2)' }}>Ver tudo</button>
                </div>
                <div className="flex gap-3.5 overflow-x-auto px-5 pb-1 md:px-8 md:gap-5 lg:px-12" style={{ scrollSnapType: 'x proximity', scrollbarWidth: 'none' }}>
                  {cat.items.map((item) => (
                    <div key={item.id} style={{ scrollSnapAlign: 'start' }} className="w-[46%] shrink-0 max-w-[190px] md:w-[220px] md:max-w-[220px]">
                      <ProductCard item={item} fav={favorites.has(item.id)} onToggleFav={() => toggleFav(item.id)} onOpen={() => openProduct(item)} onQuickAdd={() => (hasOptions(item) ? openProduct(item) : quickAdd(item))} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="px-5 pt-6 md:px-8 lg:px-12">
            <p className="mb-4 text-[12px]" style={{ color: 'var(--st-muted)' }}>{filteredItems.length} {filteredItems.length === 1 ? 'produto' : 'produtos'}</p>
            {filteredItems.length === 0 ? (
              <div className="py-16 text-center">
                <p style={{ color: 'var(--st-muted)' }}>Nada encontrado com estes filtros.</p>
                <button onClick={clearFilters} className="mt-2 text-[13px] font-semibold underline" style={{ color: 'var(--st-primary-2)' }}>Limpar filtros</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-x-6 md:gap-y-10">
                {filteredItems.map((item) => (
                  <ProductCard key={item.id} item={item} fav={favorites.has(item.id)} onToggleFav={() => toggleFav(item.id)} onOpen={() => openProduct(item)} onQuickAdd={() => (hasOptions(item) ? openProduct(item) : quickAdd(item))} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra flutuante da sacola (só mobile — no desktop a sacola já se vê no header) */}
      {count > 0 && !cartOpen && !product && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-[86px] left-1/2 z-20 flex w-[calc(100%-2.5rem)] max-w-[440px] -translate-x-1/2 items-center justify-between rounded-full px-6 py-3.5 text-[13px] font-semibold uppercase tracking-[0.1em] text-white md:hidden"
          style={{ background: 'var(--st-grad)' }}
        >
          <span className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-white/25 text-[11px]">{count}</span>Ver sacola</span>
          <span>{mt(subtotal)}</span>
        </button>
      )}

      {/* Bottom nav — padrão de app mobile; escondida no desktop (ações vivem no header) */}
      <nav className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[480px] -translate-x-1/2 md:hidden" style={{ background: 'var(--st-bg)', borderTop: '1px solid var(--st-line)', paddingBottom: 16 }}>
        {NAV.map((n) => (
          <button key={n.id} onClick={n.onClick} className="flex flex-1 flex-col items-center gap-1 pb-1.5 pt-2.5">
            <NavIcon path={n.path} active={!!n.active} />
            <span className="text-[10px]" style={{ color: n.active ? 'var(--st-primary)' : 'var(--st-muted)', fontWeight: n.active ? 600 : 400 }}>{n.label}</span>
          </button>
        ))}
      </nav>

      {/* Drawer da sacola — folha inferior no mobile; painel lateral fixo no desktop */}
      {cartOpen && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end md:flex-row md:justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0" style={{ background: 'rgba(20,20,20,0.4)' }} onClick={() => setCartOpen(false)} />
          <div className="relative mx-auto flex max-h-[85vh] w-full max-w-[480px] flex-col rounded-t-3xl md:mx-0 md:h-full md:max-h-full md:w-full md:max-w-[440px] md:rounded-t-none md:rounded-l-3xl" style={{ background: 'var(--st-bg)' }}>
            <div className="flex items-center justify-between border-b p-4" style={{ borderColor: 'var(--st-line)' }}>
              <h2 className="text-lg font-semibold">Minha sacola</h2>
              <button onClick={() => setCartOpen(false)} className="text-xl" style={{ color: 'var(--st-muted)' }} aria-label="Fechar">✕</button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
              {cart.length === 0 && <p className="py-10 text-center" style={{ color: 'var(--st-muted)' }}>Sacola vazia</p>}
              {cart.map((line, idx) => {
                const isGift = giftItemIds.has(line.menuItemId);
                const it = lineDetail(line.menuItemId);
                if (!it && !isGift) return null;

                if (isGift) {
                  return (
                    <div key={idx} className="flex items-center gap-3 rounded-2xl p-3" style={{ background: '#f2f8f3', border: '1px solid #cfe6d4' }}>
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl text-3xl" style={{ background: '#e6f2e9' }}>🎁</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{refResult?.gift_item_name ?? 'Brinde'}</p>
                        <p className="text-sm font-semibold" style={{ color: '#16a34a' }}>Grátis</p>
                      </div>
                      <button onClick={() => setQtyByIndex(idx, 0)} className="text-sm" style={{ color: 'var(--st-muted)' }} aria-label="Remover brinde">✕</button>
                    </div>
                  );
                }

                const variant = line.variantId ? it!.variants?.find((v) => v.id === line.variantId) : undefined;
                const addons = (it!.addons ?? []).filter((a) => (line.addonIds ?? []).includes(a.id));
                const unit = lineUnitPrice(it!, line.variantId, line.addonIds);
                return (
                  <div key={idx} className="flex items-center gap-3 rounded-2xl p-3" style={{ border: '1px solid var(--st-line)' }}>
                    <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-xl" style={{ background: 'var(--st-card)' }}>
                      <SmartImage src={it!.photo_url} alt={it!.name} monogram={it!.name} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{it!.name}</p>
                      {(variant || addons.length > 0) && (
                        <p className="truncate text-[11px]" style={{ color: 'var(--st-muted)' }}>{[variant?.name, ...addons.map((a) => a.name)].filter(Boolean).join(' · ')}</p>
                      )}
                      <p className="mt-0.5 text-sm font-semibold">{mt(unit * line.qty)}</p>
                    </div>
                    <div className="flex shrink-0 items-center rounded-full" style={{ border: '1px solid var(--st-line)' }}>
                      <button onClick={() => setQtyByIndex(idx, line.qty - 1)} className="grid h-8 w-8 place-items-center" aria-label="Diminuir">−</button>
                      <span className="w-5 text-center text-sm font-semibold">{line.qty}</span>
                      <button onClick={() => setQtyByIndex(idx, line.qty + 1)} className="grid h-8 w-8 place-items-center" aria-label="Aumentar">+</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-3 border-t p-4" style={{ borderColor: 'var(--st-line)' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--st-muted)' }}>Subtotal</span>
                <span className="font-semibold">{mt(subtotal)}</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--st-muted)' }}>Entrega calculada no checkout.</p>
              <div className="flex gap-2">
                <button onClick={() => { clear(); setCartOpen(false); }} className="rounded-full px-5 py-3 text-sm" style={{ border: '1px solid var(--st-line)', color: 'var(--st-muted-2)' }}>Limpar</button>
                <button onClick={() => router.push('/checkout')} disabled={cart.length === 0} className="flex-1 rounded-full py-3 text-sm font-semibold uppercase tracking-[0.1em] text-white disabled:opacity-40" style={{ background: 'var(--st-grad)' }}>Finalizar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PDP */}
      {product && (
        <ProductDetail
          item={product}
          categoryLabel={categoryOf(product.id)}
          isFav={favorites.has(product.id)}
          onToggleFav={() => toggleFav(product.id)}
          onAddToCart={onAddFromPDP}
          onClose={() => setProduct(null)}
          onOpenItem={openProductById}
        />
      )}

      {/* Conta (F7) */}
      {account === 'identify' && <IdentifyModal onClose={() => setAccount(null)} onSubmit={onIdentified} />}
      {account === 'orders' && <OrdersOverlay orders={myOrders} onClose={() => setAccount(null)} onOpen={(id) => router.push(`/order-status/${id}`)} onReorder={reorder} />}
      {account === 'profile' && customer && (
        <ProfileOverlay customer={customer} onClose={() => setAccount(null)} onLogout={logout} onReorder={reorder} onOrders={() => { setAccount('orders'); if (phone) loadMyOrders(phone); }} />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-[96px] left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2 text-sm text-white" style={{ background: 'rgba(20,20,20,0.92)' }}>{toast}</div>
      )}
    </Shell>
  );
}

// ── Ícone SVG de traço ────────────────────────────────────────────────────────
function NavIcon({ path, active, muted, small }: { path: string; active?: boolean; muted?: boolean; small?: boolean }) {
  const size = small ? 16 : 22;
  const stroke = active ? 'var(--st-primary)' : muted ? 'var(--st-muted)' : 'var(--st-muted-2)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
  );
}

// ── Chip de filtro ────────────────────────────────────────────────────────────
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[12.5px] font-medium transition-colors"
      style={active
        ? { background: 'var(--st-primary)', color: '#fff', border: '1px solid var(--st-primary)' }
        : { background: 'transparent', color: 'var(--st-text)', border: '1px solid var(--st-line)' }}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

// ── Carrossel de banners: rotativo, mesmo lugar, transições bem diferentes entre si ──
// Só propriedades "baratas" (opacity/transform/clip-path) — nunca width/top/left.
type BannerEffect = 'fade' | 'slide' | 'zoom' | 'wipe';
const BANNER_EFFECTS: BannerEffect[] = ['fade', 'slide', 'zoom', 'wipe'];
const BANNER_DURATION = 800;
const BANNER_INTERVAL = 6000;

function bannerLayerStyle(effect: BannerEffect, active: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute', inset: 0,
    pointerEvents: active ? 'auto' : 'none',
    zIndex: active ? 2 : 1,
  };
  switch (effect) {
    case 'slide':
      return {
        ...base,
        transition: `opacity ${BANNER_DURATION}ms ease, transform ${BANNER_DURATION}ms cubic-bezier(.22,.61,.36,1)`,
        opacity: active ? 1 : 0,
        transform: active ? 'translateX(0)' : 'translateX(4%)',
      };
    case 'zoom':
      return {
        ...base,
        transition: `opacity ${BANNER_DURATION}ms ease, transform ${BANNER_DURATION}ms cubic-bezier(.22,.61,.36,1)`,
        opacity: active ? 1 : 0,
        transform: active ? 'scale(1)' : 'scale(1.12)',
      };
    case 'wipe':
      return {
        ...base,
        transition: `clip-path ${BANNER_DURATION}ms cubic-bezier(.77,0,.175,1), opacity ${Math.round(BANNER_DURATION / 3)}ms ease`,
        opacity: active ? 1 : 0,
        clipPath: active ? 'inset(0 0 0 0%)' : 'inset(0 0 0 100%)',
      };
    default: // fade
      return { ...base, transition: `opacity ${BANNER_DURATION}ms ease`, opacity: active ? 1 : 0 };
  }
}

function BannerCarousel({ banners, onOpen }: { banners: Banner[]; onOpen: (b: Banner) => void }) {
  const [index, setIndex] = useState(0);
  const [effectIdx, setEffectIdx] = useState(0);
  const multi = banners.length > 1;

  // Reagenda a troca sempre que o índice muda (auto OU manual) — nunca "briga" com o clique nos pontinhos.
  useEffect(() => {
    if (!multi) return;
    const t = setTimeout(() => {
      setIndex((i) => (i + 1) % banners.length);
      setEffectIdx((e) => (e + 1) % BANNER_EFFECTS.length);
    }, BANNER_INTERVAL);
    return () => clearTimeout(t);
  }, [index, multi, banners.length]);

  const goTo = (i: number) => {
    if (i === index) return;
    setIndex(i);
    setEffectIdx((e) => (e + 1) % BANNER_EFFECTS.length);
  };

  const effect = BANNER_EFFECTS[effectIdx];

  return (
    <div className="relative w-full overflow-hidden rounded-3xl" style={{ aspectRatio: '16 / 9', background: 'var(--st-card)' }}>
      {banners.map((b, i) => (
        <div key={b.id} style={bannerLayerStyle(effect, i === index)}>
          <button onClick={() => onOpen(b)} className="block h-full w-full" aria-label="Ver coleção" tabIndex={i === index ? 0 : -1}>
            {b.media_type === 'video' ? (
              <video src={b.image_url} className="h-full w-full object-cover" autoPlay muted loop playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.image_url} alt="" className="h-full w-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} />
            )}
          </button>
        </div>
      ))}

      {multi && (
        <div className="absolute inset-x-0 bottom-3 z-[3] flex justify-center gap-1.5">
          {banners.map((b, i) => (
            <button
              key={b.id}
              onClick={() => goTo(i)}
              aria-label={`Ir para o banner ${i + 1}`}
              aria-current={i === index}
              className="h-1.5 rounded-full transition-all"
              style={{ width: i === index ? 20 : 6, background: i === index ? '#fff' : 'rgba(255,255,255,0.5)' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Card de produto (boutique claro) ──────────────────────────────────────────
function ProductCard({ item, fav, onToggleFav, onOpen, onQuickAdd }: { item: MenuItem; fav: boolean; onToggleFav: () => void; onOpen: () => void; onQuickAdd: () => void }) {
  return (
    <div className="group">
      <button onClick={onOpen} className="block w-full text-left" aria-label={item.name}>
        <div className="relative overflow-hidden rounded-2xl" style={{ aspectRatio: '3 / 4', background: 'var(--st-card)', border: '1px solid var(--st-line)' }}>
          <SmartImage src={item.photo_url} alt={item.name} monogram={item.name} rounded="rounded-2xl" />
          <span
            role="button" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onToggleFav(); } }}
            className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full text-[15px]"
            style={{ background: 'rgba(255,255,255,0.9)', color: fav ? 'var(--st-primary-2)' : 'var(--st-text)' }}
            aria-label="Favorito"
          >{fav ? '♥' : '♡'}</span>
        </div>
      </button>
      <div className="mt-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <button onClick={onOpen} className="block w-full truncate text-left text-[13.5px] font-medium">{item.name}</button>
          <p className="mt-0.5 text-[13px]" style={{ color: 'var(--st-muted-2)' }}>
            {hasOptions(item) && <span className="text-[11px]" style={{ color: 'var(--st-muted)' }}>desde </span>}
            {mt(item.price_cents)}
          </p>
        </div>
        <button
          onClick={onQuickAdd}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white"
          style={{ background: 'var(--st-grad)' }}
          aria-label={hasOptions(item) ? `Escolher opções de ${item.name}` : `Adicionar ${item.name} à sacola`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
    </div>
  );
}

// Coluna app centrada (mobile-first; expande para um layout de loja no desktop)
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[480px] md:max-w-5xl lg:max-w-6xl" style={{ background: 'var(--st-bg)', color: 'var(--st-text)', fontFamily: 'var(--font-store)' }}>
      {children}
    </div>
  );
}

// ── Conta (F7): overlay full-screen (claro) ───────────────────────────────────
function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 md:flex md:items-center md:justify-center md:p-6" style={{ background: 'rgba(20,20,20,0.35)' }}>
      <div className="mx-auto flex h-full w-full max-w-[480px] flex-col md:h-auto md:max-h-[85vh] md:max-w-md md:overflow-hidden md:rounded-3xl md:shadow-2xl" style={{ background: 'var(--st-bg)', color: 'var(--st-text)' }}>
        <header className="flex shrink-0 items-center gap-3 border-b px-4 py-4" style={{ borderColor: 'var(--st-line)' }}>
          <button onClick={onClose} className="text-2xl leading-none" aria-label="Voltar">←</button>
          <h1 className="text-xl font-semibold">{title}</h1>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      </div>
    </div>
  );
}

function IdentifyModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (phone: string, name?: string) => void | Promise<void> }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const input = 'w-full rounded-xl p-3 focus:outline-none';
  const inputStyle = { border: '1px solid var(--st-line)', color: 'var(--st-text)' } as React.CSSProperties;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.trim().length < 6) return;
    setBusy(true);
    await onSubmit(phone.trim(), name.trim() || undefined);
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: 'rgba(20,20,20,0.5)' }}>
      <div className="w-full max-w-[480px] rounded-t-3xl p-6 sm:rounded-3xl" style={{ background: 'var(--st-bg)', color: 'var(--st-text)' }}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Entrar</h2>
          <button onClick={onClose} className="text-xl" style={{ color: 'var(--st-muted)' }} aria-label="Fechar">✕</button>
        </div>
        <p className="mb-5 text-sm" style={{ color: 'var(--st-muted)' }}>Identifica-te com o teu telefone para veres os teus pedidos e favoritos.</p>
        <form onSubmit={submit} className="space-y-3">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="Telefone (+258 …)" className={input} style={inputStyle} required />
          <input value={name} onChange={(e) => setName(e.target.value)} type="text" placeholder="Nome (opcional)" className={input} style={inputStyle} />
          <button type="submit" disabled={busy || phone.trim().length < 6} className="w-full rounded-full py-3.5 font-semibold uppercase tracking-[0.1em] text-white disabled:opacity-40" style={{ background: 'var(--st-grad)' }}>{busy ? 'A entrar…' : 'Entrar'}</button>
          <button type="button" onClick={onClose} className="w-full py-2 text-sm" style={{ color: 'var(--st-muted)' }}>Agora não</button>
        </form>
      </div>
    </div>
  );
}

function OrdersOverlay({ orders, onClose, onOpen, onReorder }: { orders: CustomerOrder[] | null; onClose: () => void; onOpen: (id: string) => void; onReorder: (items: ReorderItem[]) => void }) {
  const all = orders ?? [];
  const active = all.filter((o) => isActiveOrder(o.status));
  const history = all.filter((o) => !isActiveOrder(o.status));
  const Card = (o: CustomerOrder) => {
    const m = ORDER_STATUS[o.status] ?? { label: o.status, color: 'var(--st-muted)' };
    return (
      <div key={o.id} className="rounded-2xl p-3.5" style={{ border: '1px solid var(--st-line)' }}>
        <div className="flex items-start justify-between">
          <button onClick={() => onOpen(o.id)} className="text-left">
            <div className="font-mono font-semibold">{o.order_number}</div>
            <div className="text-[11px]" style={{ color: 'var(--st-muted)' }}>{new Date(o.created_at).toLocaleDateString('pt-MZ', { day: '2-digit', month: 'short', year: 'numeric' })} · {o.items.reduce((s, it) => s + it.qty, 0)} itens</div>
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: m.color }}><span className="h-2 w-2 rounded-full bg-current" />{m.label}</span>
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <span className="font-semibold">{mt(o.total_cents)}</span>
          <div className="flex gap-2">
            <button onClick={() => onOpen(o.id)} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ border: '1px solid var(--st-line)', color: 'var(--st-muted-2)' }}>Acompanhar</button>
            <button onClick={() => onReorder(o.items)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-white" style={{ background: 'var(--st-grad)' }}>↻ Repetir</button>
          </div>
        </div>
      </div>
    );
  };
  return (
    <Overlay title="Meus Pedidos" onClose={onClose}>
      {orders === null ? (
        <p className="py-10 text-center" style={{ color: 'var(--st-muted)' }}>A carregar…</p>
      ) : all.length === 0 ? (
        <p className="py-10 text-center" style={{ color: 'var(--st-muted)' }}>Ainda não há pedidos com este telefone.</p>
      ) : (
        <div className="space-y-5">
          {active.length > 0 && <div><h3 className="mb-2 font-semibold">Ativos</h3><div className="space-y-2.5">{active.map(Card)}</div></div>}
          {history.length > 0 && <div><h3 className="mb-2 font-semibold">Histórico</h3><div className="space-y-2.5">{history.map(Card)}</div></div>}
        </div>
      )}
    </Overlay>
  );
}

function ProfileOverlay({ customer, onClose, onLogout, onOrders, onReorder }: { customer: CustomerSummary; onClose: () => void; onLogout: () => void; onOrders: () => void; onReorder: (items: ReorderItem[]) => void }) {
  const initial = (customer.name || customer.phone || '?').trim()[0]?.toUpperCase() ?? '?';
  return (
    <Overlay title="Perfil" onClose={onClose}>
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-14 w-14 place-items-center rounded-full text-xl font-semibold text-white" style={{ background: 'var(--st-grad)' }}>{initial}</div>
        <div>
          <div className="text-lg font-semibold">{customer.name || 'Cliente'}</div>
          <div className="text-sm" style={{ color: 'var(--st-muted)' }}>{customer.phone}</div>
        </div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-3.5 text-center" style={{ border: '1px solid var(--st-line)' }}>
          <div className="text-xl font-semibold">{customer.orders_count}</div>
          <div className="text-[11px]" style={{ color: 'var(--st-muted)' }}>Pedidos</div>
        </div>
        <div className="rounded-2xl p-3.5 text-center" style={{ border: '1px solid var(--st-line)' }}>
          <div className="text-xl font-semibold">{mt(customer.total_spent_cents)}</div>
          <div className="text-[11px]" style={{ color: 'var(--st-muted)' }}>Total gasto</div>
        </div>
      </div>
      {customer.favorites.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 font-semibold">Os teus favoritos</h3>
          <div className="space-y-2">
            {customer.favorites.map((f) => (
              <div key={f.menu_item_id} className="flex items-center justify-between rounded-xl p-2.5" style={{ border: '1px solid var(--st-line)' }}>
                <span className="text-sm">{f.name}</span>
                <button onClick={() => onReorder([{ menu_item_id: f.menu_item_id, qty: 1 }])} className="rounded-full px-3 py-1.5 text-xs font-semibold text-white" style={{ background: 'var(--st-grad)' }}>+ Adicionar</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <button onClick={onOrders} className="mb-2.5 w-full rounded-full py-3.5 font-semibold" style={{ border: '1px solid var(--st-line)' }}>Ver os meus pedidos</button>
      <button onClick={onLogout} className="w-full rounded-full py-3.5 font-semibold" style={{ border: '1px solid var(--st-line)', color: 'var(--st-muted)' }}>Sair</button>
    </Overlay>
  );
}

// Loja fechada — lista de espera (claro)
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

  const inputCls = 'w-full rounded-xl p-3 focus:outline-none';
  const inputStyle = { border: '1px solid var(--st-line)', color: 'var(--st-text)' } as React.CSSProperties;

  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full">
        <div className="rounded-3xl p-6" style={{ border: '1px solid var(--st-line)' }}>
          <div className="mb-6 text-center">
            <div className="mb-4 text-[18px] font-semibold tracking-[0.3em]">{ST.logoText}</div>
            <h1 className="mb-2 text-2xl font-semibold">Loja fechada</h1>
            <p style={{ color: 'var(--st-muted)' }}>Deixe o seu contacto e avisamos quando abrirmos.</p>
          </div>
          {submitted ? (
            <div className="py-8 text-center">
              <div className="mb-4 text-5xl">✓</div>
              <p className="text-lg font-semibold" style={{ color: '#16a34a' }}>Adicionado à lista de espera</p>
              <p className="mt-2" style={{ color: 'var(--st-muted)' }}>Avisaremos quando a loja abrir.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" className={inputCls} style={inputStyle} required />
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+258 84 123 4567" className={inputCls} style={inputStyle} required />
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Alguma observação? (opcional)" rows={3} className={inputCls} style={inputStyle} />
              {error && <p className="text-sm" style={{ color: '#dc2626' }}>{error}</p>}
              <button type="submit" disabled={submitting || !name || !phone} className="w-full rounded-full py-3 font-semibold uppercase tracking-[0.1em] text-white disabled:opacity-40" style={{ background: 'var(--st-grad)' }}>{submitting ? 'A enviar…' : 'Entrar na lista'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
