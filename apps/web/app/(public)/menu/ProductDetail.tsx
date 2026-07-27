'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatMT, type Cents } from '@delivery/core';
import { useBodyScrollLock } from '@/utils/useBodyScrollLock';
import type { MenuItem, RelatedProduct } from './menu-types';
import { SmartImage, colorForName, variantsLookLikeColors, isLightColor } from './menu-ui';

const mt = (cents: number) => formatMT(cents as Cents);

// preço unitário = (variante escolhida ou base) + Σ adicionais. PREVIEW no client;
// o servidor (create_order) é a verdade (CLAUDE §6 / (public)/CLAUDE §6).
function lineUnitPrice(item: MenuItem, variantId?: string, addonIds: string[] = []): number {
  const base = variantId
    ? item.variants?.find((v) => v.id === variantId)?.price_cents ?? item.price_cents
    : item.price_cents;
  const addons = (item.addons ?? [])
    .filter((a) => addonIds.includes(a.id))
    .reduce((s, a) => s + a.price_cents, 0);
  return base + addons;
}

export interface AddToCartPayload {
  qty: number;
  variantId?: string;
  addonIds: string[];
  unitPriceCents: number;
}

interface Props {
  item: MenuItem;
  categoryLabel?: string;
  isFav: boolean;
  onToggleFav: () => void;
  onAddToCart: (p: AddToCartPayload) => void;
  onClose: () => void;
  onOpenItem: (id: string) => void;
}

export default function ProductDetail({
  item,
  categoryLabel,
  isFav,
  onToggleFav,
  onAddToCart,
  onClose,
  onOpenItem,
}: Props) {
  const [qty, setQty] = useState(1);
  const [selVariant, setSelVariant] = useState<string | undefined>(undefined);
  const [selAddons, setSelAddons] = useState<string[]>([]);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);

  // Sem isto, o gesto de scroll no modal "vaza" e rola a Home por baixo (mobile).
  useBodyScrollLock(true);

  // reset ao trocar de produto (ex.: clicar num relacionado)
  useEffect(() => {
    const def = item.variants?.find((v) => v.is_default) ?? item.variants?.[0];
    setSelVariant(def?.id);
    setSelAddons([]);
    setQty(1);
    setGalleryIdx(0);
    setSizeGuideOpen(false);
  }, [item.id, item.variants]);

  const variants = useMemo(() => item.variants ?? [], [item.variants]);
  const addons = item.addons ?? [];
  const useColorSwatches = useMemo(
    () => variantsLookLikeColors(variants.map((v) => v.name)),
    [variants],
  );

  // Galeria: usa photo_url (1 imagem hoje). 0 → painel de gradiente elegante.
  const gallery: (string | null)[] = item.photo_url ? [item.photo_url] : [null];
  const unit = lineUnitPrice(item, selVariant, selAddons);

  // Renderizado 2x (desktop in-flow + footer fixo mobile) — ver JSX abaixo.
  const addToCartButton = (
    <button
      onClick={() => onAddToCart({ qty, variantId: selVariant, addonIds: selAddons, unitPriceCents: unit })}
      className="flex h-12 w-full items-center justify-between rounded-full px-6 text-[13px] font-semibold uppercase tracking-[0.12em] text-white"
      style={{ background: 'var(--st-grad)' }}
    >
      <span>Adicionar ao carrinho</span>
      <span>{mt(unit * qty)}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-40 md:flex md:items-center md:justify-center md:p-6" style={{ background: 'rgba(20,20,20,0.28)' }}>
      <div
        className="mx-auto flex h-full w-full max-w-[480px] flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] md:h-[min(90vh,760px)] md:max-w-4xl md:flex-row md:overflow-hidden md:rounded-3xl md:shadow-2xl"
        style={{ background: 'var(--st-bg)', color: 'var(--st-text)', fontFamily: 'var(--font-store)' }}
      >
        {/* ── Galeria (coluna esquerda no desktop) ─────────────────── */}
        {/* Mobile: flui normalmente e scrolla junto com o conteudo (ver botao fixo
            no fim do ficheiro) — antes a foto era um bloco de altura fixa que NAO
            fazia parte da area com scroll, por isso arrastar sobre ela nao tinha
            efeito nenhum. */}
        <div className="shrink-0 md:flex md:h-full md:w-1/2 md:shrink-0 md:flex-col">
          <div className="relative aspect-[2/3] max-h-[70vh] md:aspect-auto md:max-h-none md:flex-1" style={{ background: 'var(--st-card)' }}>
            <SmartImage src={gallery[galleryIdx]} alt={item.name} monogram={item.name} fit="contain" />

            <button
              onClick={onClose}
              className="fixed left-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full text-lg md:absolute"
              style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--st-text)', boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}
              aria-label="Voltar"
            >
              ‹
            </button>
            <button
              onClick={onToggleFav}
              className="fixed right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full text-lg md:absolute"
              style={{ background: 'rgba(255,255,255,0.9)', color: isFav ? 'var(--st-primary-2)' : 'var(--st-text)', boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}
              aria-label="Adicionar aos favoritos"
            >
              {isFav ? '♥' : '♡'}
            </button>
          </div>

          {gallery.length > 1 && (
            <div className="flex gap-2 px-5 pt-3">
              {gallery.map((g, i) => (
                <button
                  key={i}
                  onClick={() => setGalleryIdx(i)}
                  className="relative h-16 w-14 overflow-hidden rounded-lg"
                  style={{ outline: i === galleryIdx ? '2px solid var(--st-primary)' : '1px solid var(--st-line)', outlineOffset: i === galleryIdx ? '-2px' : '-1px' }}
                  aria-label={`Ver imagem ${i + 1}`}
                >
                  <SmartImage src={g} alt={`${item.name} ${i + 1}`} monogram={item.name} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Coluna direita (desktop): conteúdo + CTA juntos ──────── */}
        <div className="flex flex-col md:min-h-0 md:flex-1 md:w-1/2">
        {/* ── Conteúdo ────────────────────────────────────────────── */}
        {/* pb-28 no mobile abre espaço pro footer fixo (abaixo) nao tapar o fim do conteudo */}
        <div className="px-5 pb-28 pt-5 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:pb-6">
          {categoryLabel && (
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--st-primary-2)' }}>
              {categoryLabel}
            </p>
          )}
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{item.name}</h1>

          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-semibold">{mt(unit)}</span>
          </div>

          {item.description && (
            <p className="mt-4 text-[13.5px] leading-relaxed" style={{ color: 'var(--st-muted-2)' }}>
              {item.description}
            </p>
          )}

          {/* Variante — swatches de cor OU pills de tamanho (só se existir) */}
          {variants.length > 0 && (
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--st-muted-2)' }}>
                  {useColorSwatches ? 'Cor' : 'Tamanho'}
                </p>
                {selVariant && (
                  <span className="text-[12px]" style={{ color: 'var(--st-muted)' }}>
                    {variants.find((v) => v.id === selVariant)?.name}
                  </span>
                )}
              </div>

              {useColorSwatches ? (
                <div className="flex flex-wrap gap-3">
                  {variants.map((v) => {
                    const hex = colorForName(v.name) ?? '#c9c9c9';
                    const sel = selVariant === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelVariant(v.id)}
                        title={v.name}
                        aria-label={v.name}
                        aria-pressed={sel}
                        className="grid h-9 w-9 place-items-center rounded-full transition-transform active:scale-95"
                        style={{ boxShadow: sel ? '0 0 0 2px var(--st-bg), 0 0 0 3.5px var(--st-primary)' : 'none' }}
                      >
                        <span
                          className="block h-7 w-7 rounded-full"
                          style={{ background: hex, border: isLightColor(hex) ? '1px solid var(--st-line)' : 'none' }}
                        />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const sel = selVariant === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelVariant(v.id)}
                        aria-pressed={sel}
                        className="min-w-[3rem] rounded-xl px-4 py-2.5 text-[13px] font-medium transition-colors"
                        style={
                          sel
                            ? { background: 'var(--st-primary)', color: '#fff', border: '1px solid var(--st-primary)' }
                            : { background: 'transparent', color: 'var(--st-text)', border: '1px solid var(--st-line)' }
                        }
                      >
                        {v.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Adicionais — multi (só se existir) */}
          {addons.length > 0 && (
            <div className="mt-6">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--st-muted-2)' }}>
                Opções
              </p>
              <div className="flex flex-wrap gap-2">
                {addons.map((a) => {
                  const sel = selAddons.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelAddons((prev) => (sel ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                      aria-pressed={sel}
                      className="rounded-full px-3.5 py-2 text-[12.5px] font-medium transition-colors"
                      style={
                        sel
                          ? { background: 'var(--st-primary)', color: '#fff', border: '1px solid var(--st-primary)' }
                          : { background: 'transparent', color: 'var(--st-text)', border: '1px solid var(--st-line)' }
                      }
                    >
                      {sel ? '✓ ' : '+ '}
                      {a.name}
                      <span className="ml-1" style={{ color: sel ? 'rgba(255,255,255,0.75)' : 'var(--st-muted)' }}>
                        +{mt(a.price_cents)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantidade */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--st-muted-2)' }}>
              Quantidade
            </p>
            <div className="flex items-center rounded-full" style={{ border: '1px solid var(--st-line)' }}>
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-10 w-11 place-items-center text-lg" aria-label="Diminuir">−</button>
              <span className="w-8 text-center font-semibold">{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} className="grid h-10 w-11 place-items-center text-lg" aria-label="Aumentar">+</button>
            </div>
          </div>

          {/* Guia de medidas (colapsável) */}
          <div className="mt-6 rounded-2xl" style={{ border: '1px solid var(--st-line)' }}>
            <button
              onClick={() => setSizeGuideOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3.5"
              aria-expanded={sizeGuideOpen}
            >
              <span className="text-[13px] font-semibold">Guia de medidas</span>
              <span className="text-[13px]" style={{ color: 'var(--st-muted)', transform: sizeGuideOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>⌄</span>
            </button>
            {sizeGuideOpen && (
              <div className="px-4 pb-4">
                <p className="mb-3 text-[12px] leading-relaxed" style={{ color: 'var(--st-muted-2)' }}>
                  Medidas em centímetros. Em caso de dúvida entre dois tamanhos, escolha o maior.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr style={{ color: 'var(--st-muted)' }}>
                        {['Tamanho', 'Peito', 'Cintura', 'Comprimento'].map((h) => (
                          <th key={h} className="border-b py-2 text-left font-medium" style={{ borderColor: 'var(--st-line)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['P', '88', '72', '66'],
                        ['M', '96', '80', '68'],
                        ['G', '104', '88', '70'],
                        ['GG', '112', '96', '72'],
                      ].map((row) => (
                        <tr key={row[0]}>
                          {row.map((c, i) => (
                            <td key={i} className="border-b py-2" style={{ borderColor: 'var(--st-line)', fontWeight: i === 0 ? 600 : 400 }}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Produtos relacionados */}
          <RelatedProducts itemId={item.id} onOpenItem={onOpenItem} />
        </div>

        {/* ── Barra: adicionar ao carrinho (desktop, dentro da coluna que já scrolla) ── */}
        <div className="hidden border-t px-5 py-3.5 md:block md:shrink-0" style={{ borderColor: 'var(--st-line)', background: 'var(--st-bg)' }}>
          {addToCartButton}
        </div>
        </div>
      </div>

      {/* Mobile: footer fixo no viewport — foto+conteúdo agora scrollam juntos (fora
          de um pai com overflow), então o CTA precisa de ficar fora dessa área pra
          continuar sempre visível/tocável sem depender de scroll. */}
      <div
        className="fixed inset-x-0 bottom-0 z-10 border-t px-5 md:hidden"
        style={{ borderColor: 'var(--st-line)', background: 'var(--st-bg)', paddingTop: '0.875rem', paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))' }}
      >
        {addToCartButton}
      </div>
    </div>
  );
}

// ── "Quem viu isto também viu" — carrossel horizontal ────────────────────────
function RelatedProducts({ itemId, onOpenItem }: { itemId: string; onOpenItem: (id: string) => void }) {
  const [products, setProducts] = useState<RelatedProduct[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProducts(null);
    fetch(`/api/related?itemId=${encodeURIComponent(itemId)}`)
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => { if (!cancelled) setProducts((d.products ?? []) as RelatedProduct[]); })
      .catch(() => { if (!cancelled) setProducts([]); });
    return () => { cancelled = true; };
  }, [itemId]);

  // Esconde a secção enquanto carrega ou se vier vazia.
  if (!products || products.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em]">Quem viu isto também viu</h2>
      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', scrollSnapType: 'x proximity' }}>
        {products.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpenItem(p.id)}
            className="shrink-0 text-left"
            style={{ width: 132, scrollSnapAlign: 'start' }}
          >
            <div className="relative overflow-hidden rounded-xl" style={{ aspectRatio: '3 / 4', background: 'var(--st-card)', border: '1px solid var(--st-line)' }}>
              <SmartImage src={p.photo_url} alt={p.name} monogram={p.name} rounded="rounded-xl" />
            </div>
            <p className="mt-2 truncate text-[12.5px] font-medium">{p.name}</p>
            <p className="text-[12.5px]" style={{ color: 'var(--st-muted-2)' }}>{mt(p.price_cents)}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
