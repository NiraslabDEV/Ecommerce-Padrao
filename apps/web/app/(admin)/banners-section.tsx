'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

// Banners de categoria da Home (ate 10, recomendado 3). Upload de imagem OU
// video (16:9, autoplay/loop/mudo na loja) para o bucket storefront-assets.
// Link: categoria especifica (filtra a PLP) OU URL personalizada.
// Cliques: analytics_events tipo 'banner_click' via get_banner_clicks().

const MAX_BANNERS = 10;
const RECOMMENDED = 3;

interface CategoryRef { id: string; name: string }

interface Banner {
  id: string;
  image_url: string;
  media_type: 'image' | 'video';
  category_id: string | null;
  custom_url: string | null;
  sort: number;
  active: boolean;
}

export function BannersSection() {
  const supabase = createClient();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<CategoryRef[]>([]);
  const [clicks, setClicks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Banner | 'new' | null>(null);
  const [error, setError] = useState('');

  const refetch = useCallback(async () => {
    setLoading(true);
    const [{ data: bs }, { data: cats }, { data: clickData }] = await Promise.all([
      supabase.from('storefront_banners').select('*').order('sort'),
      supabase.from('menu_categories').select('id, name').order('sort'),
      supabase.rpc('get_banner_clicks'),
    ]);
    setBanners((bs ?? []) as Banner[]);
    setCategories((cats ?? []) as CategoryRef[]);
    setClicks((clickData ?? {}) as Record<string, number>);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { refetch(); }, [refetch]);

  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? null;

  async function toggleActive(b: Banner) {
    setError('');
    const { error: err } = await supabase.from('storefront_banners').update({ active: !b.active }).eq('id', b.id);
    if (err) { setError(err.message); return; }
    refetch();
  }

  async function remove(b: Banner) {
    if (!confirm('Apagar este banner?')) return;
    setError('');
    const { error: err } = await supabase.from('storefront_banners').delete().eq('id', b.id);
    if (err) { setError(err.message); return; }
    refetch();
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= banners.length) return;
    setError('');
    const a = banners[index];
    const b = banners[target];
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('storefront_banners').update({ sort: b.sort }).eq('id', a.id),
      supabase.from('storefront_banners').update({ sort: a.sort }).eq('id', b.id),
    ]);
    if (e1 || e2) { setError((e1 ?? e2)?.message ?? 'Erro'); return; }
    refetch();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-white">Banners da loja</h2>
        <span className="text-xs" style={{ color: banners.length > RECOMMENDED ? '#f59e0b' : '#6b7280' }}>
          {banners.length}/{MAX_BANNERS} · recomendado {RECOMMENDED}
        </span>
      </div>
      <p className="text-sm text-[#A8A8B0] mb-5">
        Aparecem na Home logo após o hero. Imagem ou vídeo 16:9 — clicar leva o cliente a uma categoria específica
        ou a um link à sua escolha.
      </p>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setEditing('new')}
          disabled={banners.length >= MAX_BANNERS}
          className="bg-[#EA1D2C] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#c8161f] transition-colors disabled:opacity-40"
        >
          + Novo banner
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-[#A8A8B0]">A carregar…</p>
      ) : banners.length === 0 ? (
        <p className="text-sm text-[#A8A8B0] border border-white/[0.08] rounded-xl p-6 text-center">
          Ainda não há banners. Cria o primeiro com &ldquo;+ Novo banner&rdquo;.
        </p>
      ) : (
        <div className="space-y-2">
          {banners.map((b, i) => (
            <div key={b.id} className="flex items-center gap-3 border border-white/[0.08] rounded-xl p-3 bg-white/[0.02]">
              <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-black/20">
                {b.media_type === 'video' ? (
                  <video src={b.image_url} className="h-full w-full object-cover" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.image_url} alt="" className="h-full w-full object-cover" />
                )}
                <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] text-white">
                  {b.media_type === 'video' ? 'VÍDEO' : 'IMG'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">
                  {b.category_id ? `→ Categoria: ${categoryName(b.category_id) ?? '—'}` : b.custom_url ? `→ ${b.custom_url}` : 'Sem destino'}
                </p>
                <p className="text-xs text-[#A8A8B0] mt-0.5">
                  {clicks[b.id] ?? 0} cliques{!b.active && ' · Inativo'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-[#A8A8B0] px-1.5 disabled:opacity-30" aria-label="Subir">↑</button>
                <button onClick={() => move(i, 1)} disabled={i === banners.length - 1} className="text-[#A8A8B0] px-1.5 disabled:opacity-30" aria-label="Descer">↓</button>
                <button onClick={() => setEditing(b)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/[0.08] text-[#A8A8B0] hover:text-white transition-colors">Editar</button>
                <button onClick={() => toggleActive(b)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/[0.08] text-[#A8A8B0] hover:text-white transition-colors">{b.active ? 'Desativar' : 'Ativar'}</button>
                <button onClick={() => remove(b)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/[0.08] text-red-400 hover:bg-red-900/20 transition-colors">Apagar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <BannerModal
          banner={editing}
          categories={categories}
          nextSort={banners.length > 0 ? Math.max(...banners.map((b) => b.sort)) + 1 : 1}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refetch(); }}
        />
      )}
    </div>
  );
}

function BannerModal({
  banner, categories, nextSort, onClose, onSaved,
}: {
  banner: Banner | 'new';
  categories: CategoryRef[];
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const isNew = banner === 'new';

  const [mediaUrl, setMediaUrl] = useState(isNew ? '' : banner.image_url);
  const [mediaType, setMediaType] = useState<'image' | 'video'>(isNew ? 'image' : banner.media_type);
  const [linkType, setLinkType] = useState<'category' | 'custom'>(isNew ? 'category' : (banner.category_id ? 'category' : 'custom'));
  const [categoryId, setCategoryId] = useState(isNew ? (categories[0]?.id ?? '') : (banner.category_id ?? categories[0]?.id ?? ''));
  const [customUrl, setCustomUrl] = useState(isNew ? '' : (banner.custom_url ?? ''));
  const [active, setActive] = useState(isNew ? true : banner.active);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function uploadFile(file: File) {
    setUploading(true);
    setError('');
    const isVideo = file.type.startsWith('video/');
    const ext = file.name.split('.').pop()?.toLowerCase() ?? (isVideo ? 'mp4' : 'jpg');
    const path = `banners/banner-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('storefront-assets')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (upErr) {
      setError(`Erro no upload: ${upErr.message}`);
      setUploading(false);
      return;
    }
    const url = supabase.storage.from('storefront-assets').getPublicUrl(path).data.publicUrl;
    setMediaUrl(url);
    setMediaType(isVideo ? 'video' : 'image');
    setUploading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!mediaUrl) { setError('Faz upload de uma imagem ou vídeo primeiro.'); return; }
    if (linkType === 'category' && !categoryId) { setError('Escolhe uma categoria.'); return; }
    if (linkType === 'custom' && !customUrl.trim()) { setError('Indica o link de destino.'); return; }

    const payload = {
      image_url: mediaUrl,
      media_type: mediaType,
      category_id: linkType === 'category' ? categoryId : null,
      custom_url: linkType === 'custom' ? customUrl.trim() : null,
      active,
      ...(isNew ? { sort: nextSort } : {}),
    };

    setSaving(true);
    const { error: err } = isNew
      ? await supabase.from('storefront_banners').insert(payload)
      : await supabase.from('storefront_banners').update(payload).eq('id', banner.id);
    setSaving(false);

    if (err) { setError(err.message); return; }
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
        <h2 className="font-bold text-lg text-[#EA1D2C]">{isNew ? 'Novo banner' : 'Editar banner'}</h2>

        <div>
          <label className={labelCls}>Imagem ou vídeo (16:9)</label>
          <div className="flex items-start gap-3">
            <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-black/20 border border-white/[0.08]">
              {mediaUrl ? (
                mediaType === 'video' ? (
                  <video src={mediaUrl} className="h-full w-full object-cover" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
                )
              ) : (
                <div className="grid h-full place-items-center text-[10px] text-[#6b7280] text-center px-1">Sem mídia</div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: '#EA1D2C' }}
              >
                {uploading ? 'A enviar…' : mediaUrl ? 'Substituir' : 'Fazer upload'}
              </button>
              <p className="text-[10px] text-[#6b7280]">Imagem (até 5MB) ou vídeo mp4/webm (até 50MB)</p>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f);
              e.target.value = '';
            }}
          />
        </div>

        <div>
          <label className={labelCls}>Ao clicar, leva para</label>
          <div className="flex gap-2 mb-2">
            <button type="button" onClick={() => setLinkType('category')} className={`flex-1 py-2 rounded-lg text-xs font-semibold ${linkType === 'category' ? 'text-white' : 'text-[#A8A8B0]'}`} style={linkType === 'category' ? { background: '#EA1D2C' } : { border: '1px solid rgba(255,255,255,0.08)' }}>
              Categoria
            </button>
            <button type="button" onClick={() => setLinkType('custom')} className={`flex-1 py-2 rounded-lg text-xs font-semibold ${linkType === 'custom' ? 'text-white' : 'text-[#A8A8B0]'}`} style={linkType === 'custom' ? { background: '#EA1D2C' } : { border: '1px solid rgba(255,255,255,0.08)' }}>
              Link personalizado
            </button>
          </div>
          {linkType === 'category' ? (
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} className={inputCls} placeholder="https://... ou /menu" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="bannerActive" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded bg-black/20 border-white/[0.08] text-[#EA1D2C] focus:ring-[#EA1D2C]" />
          <label htmlFor="bannerActive" className="text-xs font-semibold text-[#A8A8B0]">Ativo</label>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 border border-white/[0.08] text-[#A8A8B0] text-sm font-semibold py-2 rounded-lg hover:text-white transition-colors">Cancelar</button>
          <button type="submit" disabled={saving || uploading} className="flex-1 bg-[#EA1D2C] text-white text-sm font-semibold py-2 rounded-lg hover:bg-[#c8161f] transition-colors disabled:opacity-50">
            {saving ? 'A guardar…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}
