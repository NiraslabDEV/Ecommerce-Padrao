'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { formatMT as coreFormatMT, type Cents } from '@delivery/core';
import { RelatedEditor } from './related-editor';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  station: string;
  sort: number;
  active: boolean;
  photo_url: string | null;
}

interface Item {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  photo_url: string | null;
  available: boolean;
  track_stock: boolean;
  stock_qty: number;
  sort: number;
}

interface Zone {
  id: string;
  name: string;
  fee_cents: number;
  active: boolean;
  sort: number;
}

interface Variant {
  id: string;
  menu_item_id: string;
  name: string;
  price_cents: number;
  sort: number;
  is_default: boolean;
  active: boolean;
}

interface Addon {
  id: string;
  menu_item_id: string;
  name: string;
  price_cents: number;
  sort: number;
  active: boolean;
}

// Estação de preparo/impressão (herdado do schema — controla para que impressora
// o item é enviado quando há mais de uma). Rótulos genéricos: nem toda loja
// tem "cozinha"; algumas só precisam de 1 estação e podem ignorar o campo.
const STATIONS = [
  { value: 'kitchen',      label: 'Estação 1 (padrão)' },
  { value: 'bar',          label: 'Estação 2' },
  { value: 'cold_kitchen', label: 'Estação 3' },
] as const;

export function stationLabel(value: string): string {
  return STATIONS.find((s) => s.value === value)?.label ?? value;
}

// DECISÃO: usar o formatMT canónico de @delivery/core (dá "MT 250,00").
// Intl currency:'MZN' dava "MTn 250,00" — proibido no CLAUDE.md.
const formatMT = (cents: number) => coreFormatMT(cents as Cents);

const decimalStringToCents = (str: string): number => {
  const num = parseFloat(str);
  if (isNaN(num)) throw new Error('Invalid number');
  return Math.round(num * 100);
};

const centsToDecimalString = (cents: number): string => {
  return (cents / 100).toFixed(2);
};

// ─── Secção ───────────────────────────────────────────────────────────────────

export function MenuSection() {
  const supabase = createClient();
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'menu' | 'zones'>('menu');
  
  // Menu state
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [editingItem, setEditingItem] = useState<Item | 'new' | null>(null);
  const [editingItemCategory, setEditingItemCategory] = useState<string>('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  // Zones state
  const [zones, setZones] = useState<Zone[]>([]);
  const [editingZone, setEditingZone] = useState<Zone | 'new' | null>(null);

  const [error, setError] = useState('');

  // Refetch functions
  const refetchMenu = useCallback(async () => {
    const [{ data: cats }, { data: its }] = await Promise.all([
      supabase.from('menu_categories').select('id, name, station, sort, active, photo_url').order('sort'),
      supabase.from('menu_items')
        .select('id, category_id, name, description, price_cents, photo_url, available, track_stock, stock_qty, sort')
        .order('sort'),
    ]);
    setCategories((cats ?? []) as Category[]);
    setItems((its ?? []) as Item[]);
  }, [supabase]);

  const refetchZones = useCallback(async () => {
    const { data } = await supabase.from('delivery_zones')
      .select('id, name, fee_cents, active, sort')
      .order('sort');
    setZones((data ?? []) as Zone[]);
  }, [supabase]);

  useEffect(() => {
    refetchMenu();
    refetchZones();
  }, [refetchMenu, refetchZones]);

  // ─── Menu CRUD ─────────────────────────────────────────────────────────────
  
  async function addCategory(name: string, station: string) {
    setError('');
    const maxSort = Math.max(0, ...categories.map((c) => c.sort));
    const { error: err } = await supabase.from('menu_categories').insert({
      name, station, sort: maxSort + 1, active: true,
    });
    if (err) { setError(`Erro ao criar categoria: ${err.message}`); return; }
    refetchMenu();
  }

  async function updateCategory(category: Category) {
    setError('');
    const { error: err } = await supabase
      .from('menu_categories')
      .update({ name: category.name, station: category.station, active: category.active, photo_url: category.photo_url })
      .eq('id', category.id);
    if (err) { setError(`Erro ao atualizar categoria: ${err.message}`); return; }
    refetchMenu();
  }

  async function deleteCategory(id: string) {
    if (!confirm('Apagar esta categoria e TODOS os seus itens?')) return;
    const { error: err } = await supabase.from('menu_categories').delete().eq('id', id);
    if (err) { setError(`Erro: ${err.message}`); return; }
    refetchMenu();
  }

  async function toggleAvailable(item: Item) {
    const { error: err } = await supabase
      .from('menu_items')
      .update({ available: !item.available })
      .eq('id', item.id);
    if (err) { setError(`Erro: ${err.message}`); return; }
    refetchMenu();
  }

  async function deleteItem(id: string) {
    if (!confirm('Apagar este item?')) return;
    const { error: err } = await supabase.from('menu_items').delete().eq('id', id);
    if (err) { setError(`Erro: ${err.message}`); return; }
    refetchMenu();
  }

  // ─── Zones CRUD ─────────────────────────────────────────────────────────────
  
  async function saveZone(z: Zone) {
    setError('');
    // Nova zona = o id gerado no modal ainda não existe na lista carregada.
    const isNew = !zones.some((existing) => existing.id === z.id);

    const { error: err } = isNew
      ? await supabase.from('delivery_zones').insert({
          name: z.name,
          fee_cents: z.fee_cents,
          active: z.active,
          sort: Math.max(0, ...zones.map((x) => x.sort)) + 1,
        })
      : await supabase
          .from('delivery_zones')
          .update({ name: z.name, fee_cents: z.fee_cents, active: z.active })
          .eq('id', z.id);

    if (err) { setError(`Erro ao guardar zona: ${err.message}`); return; }
    refetchZones();
  }

  async function deleteZone(id: string) {
    if (!confirm('Apagar esta zona?')) return;
    const { error: err } = await supabase.from('delivery_zones').delete().eq('id', id);
    if (err) { setError(`Erro: ${err.message}`); return; }
    refetchZones();
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-[#EA1D2C] bg-[#EA1D2C]/10 border border-[#EA1D2C]/30 rounded-xl px-4 py-3">{error}</p>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('menu')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'menu'
              ? 'bg-[#EA1D2C] text-white'
              : 'bg-black/20 text-[#A8A8B0] hover:text-[#e8e8ea]'
          }`}
        >
          Catálogo
        </button>
        <button
          onClick={() => setActiveTab('zones')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'zones'
              ? 'bg-[#EA1D2C] text-white'
              : 'bg-black/20 text-[#A8A8B0] hover:text-[#e8e8ea]'
          }`}
        >
          Zonas de Entrega
        </button>
      </div>

      {/* Menu Tab */}
      {activeTab === 'menu' && (
        <div className="space-y-6">
          <NewCategoryForm onAdd={addCategory} />

          {categories.length === 0 && (
            <p className="text-gray-400 text-center py-8">Sem categorias. Cria a primeira acima.</p>
          )}

          {categories.map((cat) => (
            <section key={cat.id} className="border border-white/[0.08] bg-white/[0.04] backdrop-blur-[12px] shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-black/20 flex items-center justify-between">
                <div>
                  <h2 className={`font-bold text-lg ${cat.active ? 'text-white' : 'text-gray-500'}`}>
                    {cat.name}
                  </h2>
                  <p className="text-xs text-[#A8A8B0]">{stationLabel(cat.station)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditingItem('new'); setEditingItemCategory(cat.id); }}
                    className="bg-[#EA1D2C] text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-[#c8161f] transition-colors"
                  >
                    + Item
                  </button>
                  <button
                    onClick={() => setEditingCategory(cat)}
                    className="text-[#A8A8B0] text-sm px-2 hover:text-white"
                    aria-label={`Editar ${cat.name}`}
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => deleteCategory(cat.id)}
                    className="text-red-400 text-sm px-1 hover:text-red-300"
                    aria-label={`Apagar ${cat.name}`}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <ul className="divide-y divide-white/[0.06]">
                {items.filter((i) => i.category_id === cat.id).map((item) => (
                  <li key={item.id} className="px-4 py-3 flex items-center gap-3">
                    {item.photo_url ? (
                      <img src={item.photo_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-white/[0.08] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm ${item.available ? 'text-white' : 'text-gray-500 line-through'}`}>
                        {item.name}
                      </p>
                      <p className="text-[#EA1D2C] font-bold text-sm">{formatMT(item.price_cents)}</p>
                      {item.track_stock && (
                        <p className="text-xs text-[#A8A8B0]">
                          Estoque: {item.stock_qty} {item.stock_qty <= 5 && '⚠️'}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => toggleAvailable(item)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                        item.available ? 'bg-green-900/30 text-green-400 border border-green-700' : 'bg-white/[0.08] text-[#A8A8B0]'
                      }`}
                    >
                      {item.available ? 'Disponível' : 'Esgotado'}
                    </button>
                    <button
                      onClick={() => { setEditingItem(item); setEditingItemCategory(cat.id); }}
                      className="text-[#A8A8B0] text-sm px-2 hover:text-white"
                    >
                      Editar
                    </button>
                    <button onClick={() => deleteItem(item.id)} className="text-red-400 text-sm px-1 hover:text-red-300">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Zones Tab */}
      {activeTab === 'zones' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-[#EA1D2C]">Zonas de Entrega</h3>
            <button
              onClick={() => setEditingZone('new')}
              className="bg-[#EA1D2C] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#c8161f] transition-colors"
            >
              + Nova Zona
            </button>
          </div>

          {zones.length === 0 && (
            <p className="text-gray-400 text-center py-8">Sem zonas de entrega.</p>
          )}

          {zones.map((zone) => (
            <div key={zone.id} className="border border-white/[0.08] bg-white/[0.04] backdrop-blur-[12px] shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className={`font-semibold ${zone.active ? 'text-white' : 'text-gray-500 line-through'}`}>
                  {zone.name}
                </p>
                <p className="text-[#EA1D2C] font-bold text-sm">{formatMT(zone.fee_cents)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingZone(zone)}
                  className="text-[#A8A8B0] text-sm px-2 hover:text-white"
                >
                  Editar
                </button>
                <button
                  onClick={() => deleteZone(zone.id)}
                  className="text-red-400 text-sm px-1 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {editingItem && (
        <ItemModal
          item={editingItem === 'new' ? null : editingItem}
          categoryId={editingItemCategory}
          onClose={() => setEditingItem(null)}
          onSaved={() => { setEditingItem(null); refetchMenu(); }}
        />
      )}

      {editingCategory && (
        <CategoryModal
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
          onSaved={(c) => { updateCategory(c); setEditingCategory(null); }}
        />
      )}

      {editingZone && (
        <ZoneModal
          zone={editingZone}
          onClose={() => setEditingZone(null)}
          onSaved={(z) => { saveZone(z); setEditingZone(null); }}
        />
      )}
    </div>
  );
}

// ─── Form de nova categoria ───────────────────────────────────────────────────

function NewCategoryForm({ onAdd }: { onAdd: (name: string, station: string) => void }) {
  const [name, setName] = useState('');
  const [station, setStation] = useState<string>('kitchen');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onAdd(name.trim(), station);
        setName('');
      }}
      className="border border-white/[0.08] bg-white/[0.04] backdrop-blur-[12px] shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-xl p-4 flex gap-2 items-end flex-wrap"
    >
      <div className="flex-1 min-w-[160px]">
        <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Nova categoria</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex: Novidades"
          className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-[#A8A8B0] focus:outline-none focus:border-[#EA1D2C]"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Estação</label>
        <select
          value={station}
          onChange={(e) => setStation(e.target.value)}
          className="bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
        >
          {STATIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="bg-[#EA1D2C] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#c8161f] transition-colors"
      >
        Criar
      </button>
    </form>
  );
}

// ─── Modal de item (criar/editar + upload de foto + estoque) ──────────────────

function ItemModal({
  item, categoryId, onClose, onSaved,
}: {
  item: Item | null;
  categoryId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [priceMT, setPriceMT] = useState(
    item ? centsToDecimalString(item.price_cents) : ''
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [trackStock, setTrackStock] = useState(item?.track_stock ?? false);
  const [stockQty, setStockQty] = useState(item?.stock_qty ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Preço em MT → centavos (única conversão; nunca float no banco)
    let priceCents: number;
    try {
      priceCents = decimalStringToCents(priceMT.replace(',', '.'));
    } catch {
      setError('Preço inválido. Usa o formato 250.00');
      return;
    }

    setSaving(true);

    // Upload da foto (path: {uuid}.{ext})
    let photoUrl = item?.photo_url ?? null;
    if (photoFile) {
      const ext = photoFile.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('menu-photos')
        .upload(path, photoFile, { cacheControl: '3600', upsert: false });
      if (upErr) {
        setError(`Erro no upload da foto: ${upErr.message}`);
        setSaving(false);
        return;
      }
      photoUrl = supabase.storage.from('menu-photos').getPublicUrl(path).data.publicUrl;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      price_cents: priceCents,
      photo_url: photoUrl,
      track_stock: trackStock,
      stock_qty: trackStock ? stockQty : 0,
    };

    const { error: err } = item
      ? await supabase.from('menu_items').update(payload).eq('id', item.id)
      : await supabase.from('menu_items').insert({
          ...payload,
          category_id: categoryId,
          available: true,
        });

    setSaving(false);
    if (err) { setError(`Erro ao guardar: ${err.message}`); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-[4px] z-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSave}
        className="border border-white/[0.08] bg-white/[0.04] backdrop-blur-[12px] shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="font-bold text-lg text-[#EA1D2C]">
          {item ? 'Editar item' : 'Novo item'}
        </h2>

        <div>
          <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
            placeholder="ex: Vestido Midi de Linho"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Descrição</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
            placeholder="ex: Corte fluido em linho natural, alças ajustáveis"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Preço (MT)</label>
          <input
            value={priceMT}
            onChange={(e) => setPriceMT(e.target.value)}
            required
            inputMode="decimal"
            className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
            placeholder="ex: 250.00"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Foto</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-[#A8A8B0]"
          />
          {item?.photo_url && !photoFile && (
            <p className="text-xs text-[#A8A8B0] mt-1">Já tem foto. Escolhe outra para substituir.</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="trackStock"
              checked={trackStock}
              onChange={(e) => setTrackStock(e.target.checked)}
              className="rounded bg-black/20 border-white/[0.08] text-[#EA1D2C] focus:ring-[#EA1D2C]"
            />
            <label htmlFor="trackStock" className="text-xs font-semibold text-[#A8A8B0]">
              Controlar estoque
            </label>
          </div>
          
          {trackStock && (
            <div>
              <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Quantidade em estoque</label>
              <input
                type="number"
                min="0"
                value={stockQty}
                onChange={(e) => setStockQty(parseInt(e.target.value) || 0)}
                className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
              />
            </div>
          )}
        </div>

        {/* Tamanhos + Adicionais + Relacionados (opcional). Só para item já
            guardado, pois referenciam menu_item_id. Sem nenhum → item "simples". */}
        {item ? (
          <>
            <OptionsEditor itemId={item.id} />
            <RelatedEditor itemId={item.id} />
          </>
        ) : (
          <p className="text-xs text-[#A8A8B0] border-t border-white/[0.08] pt-3">
            Guarda o item primeiro para adicionar <strong>Tamanhos</strong>, <strong>Adicionais</strong> e <strong>Relacionados</strong> (opcional).
          </p>
        )}

        {error && (
          <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-white/[0.08] text-[#A8A8B0] font-semibold py-3 rounded-xl text-sm hover:bg-white/[0.08] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-[#EA1D2C] text-white font-bold py-3 rounded-xl text-sm disabled:opacity-60 hover:bg-[#c8161f] transition-colors"
          >
            {saving ? 'A guardar…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Editor de Tamanhos + Adicionais (inline, dentro do ItemModal) ─────────────

function OptionsEditor({ itemId }: { itemId: string }) {
  const supabase = createClient();
  const [variants, setVariants] = useState<Variant[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [err, setErr] = useState('');

  const refetch = useCallback(async () => {
    const [{ data: vs }, { data: as }] = await Promise.all([
      supabase.from('menu_item_variants')
        .select('id, menu_item_id, name, price_cents, sort, is_default, active')
        .eq('menu_item_id', itemId).order('sort'),
      supabase.from('menu_addons')
        .select('id, menu_item_id, name, price_cents, sort, active')
        .eq('menu_item_id', itemId).order('sort'),
    ]);
    setVariants((vs ?? []) as Variant[]);
    setAddons((as ?? []) as Addon[]);
  }, [supabase, itemId]);

  useEffect(() => { refetch(); }, [refetch]);

  async function addVariant(name: string, priceCents: number) {
    setErr('');
    const sort = Math.max(0, ...variants.map((v) => v.sort)) + 1;
    const { error } = await supabase.from('menu_item_variants').insert({
      menu_item_id: itemId, name, price_cents: priceCents, sort,
      is_default: variants.length === 0, active: true,
    });
    if (error) { setErr(`Erro: ${error.message}`); return; }
    refetch();
  }

  async function deleteVariant(id: string) {
    const { error } = await supabase.from('menu_item_variants').delete().eq('id', id);
    if (error) { setErr(`Erro: ${error.message}`); return; }
    refetch();
  }

  async function setDefaultVariant(id: string) {
    setErr('');
    // Só um is_default por item: limpar os outros, marcar este.
    await supabase.from('menu_item_variants').update({ is_default: false }).eq('menu_item_id', itemId);
    const { error } = await supabase.from('menu_item_variants').update({ is_default: true }).eq('id', id);
    if (error) { setErr(`Erro: ${error.message}`); return; }
    refetch();
  }

  async function addAddon(name: string, priceCents: number) {
    setErr('');
    const sort = Math.max(0, ...addons.map((a) => a.sort)) + 1;
    const { error } = await supabase.from('menu_addons').insert({
      menu_item_id: itemId, name, price_cents: priceCents, sort, active: true,
    });
    if (error) { setErr(`Erro: ${error.message}`); return; }
    refetch();
  }

  async function deleteAddon(id: string) {
    const { error } = await supabase.from('menu_addons').delete().eq('id', id);
    if (error) { setErr(`Erro: ${error.message}`); return; }
    refetch();
  }

  return (
    <div className="border-t border-white/[0.08] pt-4 space-y-4">
      {err && <p className="text-sm text-red-400">{err}</p>}

      {/* Tamanhos */}
      <div>
        <p className="text-xs font-semibold text-[#A8A8B0] mb-2">
          Tamanhos <span className="font-normal">(escolha única — substitui o preço base)</span>
        </p>
        <ul className="space-y-1.5 mb-2">
          {variants.map((v) => (
            <li key={v.id} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => setDefaultVariant(v.id)}
                title={v.is_default ? 'Padrão' : 'Tornar padrão'}
                className={`text-xs px-1.5 py-0.5 rounded ${v.is_default ? 'bg-[#EA1D2C] text-white' : 'bg-white/[0.08] text-[#A8A8B0]'}`}
              >
                {v.is_default ? '★ Padrão' : 'Tornar padrão'}
              </button>
              <span className="flex-1 text-white">{v.name}</span>
              <span className="text-[#EA1D2C] font-semibold">{formatMT(v.price_cents)}</span>
              <button type="button" onClick={() => deleteVariant(v.id)} className="text-red-400 px-1">✕</button>
            </li>
          ))}
          {variants.length === 0 && <li className="text-xs text-[#A8A8B0]">Sem tamanhos — item de preço único.</li>}
        </ul>
        <OptionAddRow placeholder="ex: Médio" onAdd={addVariant} />
      </div>

      {/* Adicionais */}
      <div>
        <p className="text-xs font-semibold text-[#A8A8B0] mb-2">
          Adicionais <span className="font-normal">(multi — somam ao preço)</span>
        </p>
        <ul className="space-y-1.5 mb-2">
          {addons.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-white">{a.name}</span>
              <span className="text-[#EA1D2C] font-semibold">+{formatMT(a.price_cents)}</span>
              <button type="button" onClick={() => deleteAddon(a.id)} className="text-red-400 px-1">✕</button>
            </li>
          ))}
          {addons.length === 0 && <li className="text-xs text-[#A8A8B0]">Sem adicionais.</li>}
        </ul>
        <OptionAddRow placeholder="ex: Embrulho para presente" onAdd={addAddon} />
      </div>
    </div>
  );
}

function OptionAddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string, priceCents: number) => void }) {
  const [name, setName] = useState('');
  const [priceMT, setPriceMT] = useState('');

  function submit() {
    if (!name.trim()) return;
    let cents: number;
    try {
      cents = decimalStringToCents(priceMT.replace(',', '.'));
    } catch {
      cents = 0;
    }
    onAdd(name.trim(), cents);
    setName(''); setPriceMT('');
  }

  return (
    <div className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-black/20 border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white placeholder-[#A8A8B0] focus:outline-none focus:border-[#EA1D2C]"
      />
      <input
        value={priceMT}
        onChange={(e) => setPriceMT(e.target.value)}
        inputMode="decimal"
        placeholder="MT"
        className="w-20 bg-black/20 border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white placeholder-[#A8A8B0] focus:outline-none focus:border-[#EA1D2C]"
      />
      <button
        type="button"
        onClick={submit}
        className="bg-white/[0.08] text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-white/[0.14] transition-colors"
      >
        +
      </button>
    </div>
  );
}

// ─── Modal de categoria (editar) ───────────────────────────────────────────────

function CategoryModal({
  category, onClose, onSaved,
}: {
  category: Category;
  onClose: () => void;
  onSaved: (c: Category) => void;
}) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(category.name);
  const [station, setStation] = useState(category.station);
  const [active, setActive] = useState(category.active);
  const [photoUrl, setPhotoUrl] = useState<string | null>(category.photo_url);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  async function uploadPhoto(file: File) {
    setUploading(true);
    setUploadErr('');
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `cat-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('menu-photos')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (upErr) { setUploadErr(`Erro: ${upErr.message}`); setUploading(false); return; }
    setPhotoUrl(supabase.storage.from('menu-photos').getPublicUrl(path).data.publicUrl);
    setUploading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-[4px] z-50 flex items-center justify-center p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSaved({ ...category, name, station, active, photo_url: photoUrl });
        }}
        className="border border-white/[0.08] bg-white/[0.04] backdrop-blur-[12px] shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl w-full max-w-md p-5 space-y-4"
      >
        <h2 className="font-bold text-lg text-[#EA1D2C]">Editar categoria</h2>

        <div>
          <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
          />
        </div>

        {/* Foto circular (para exibição na loja) */}
        <div>
          <label className="block text-xs font-semibold text-[#A8A8B0] mb-2">Foto da categoria (círculo na loja)</label>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 bg-black/30 flex items-center justify-center" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
              {photoUrl
                ? <img src={photoUrl} alt="foto" className="w-full h-full object-cover" />
                : <span className="text-white font-black text-xl">{name[0] ?? '?'}</span>
              }
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#EA1D2C] disabled:opacity-50"
              >
                {uploading ? 'A enviar…' : photoUrl ? 'Trocar foto' : 'Adicionar foto'}
              </button>
              {photoUrl && (
                <button type="button" onClick={() => setPhotoUrl(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}>
                  Remover
                </button>
              )}
            </div>
          </div>
          {uploadErr && <p className="text-xs mt-1 text-[#ef4444]">{uploadErr}</p>}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ''; }} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Estação</label>
          <select
            value={station}
            onChange={(e) => setStation(e.target.value)}
            className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
          >
            {STATIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="categoryActive"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="rounded bg-black/20 border-white/[0.08] text-[#EA1D2C] focus:ring-[#EA1D2C]"
          />
          <label htmlFor="categoryActive" className="text-xs font-semibold text-[#A8A8B0]">
            Ativa
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-white/[0.08] text-[#A8A8B0] font-semibold py-3 rounded-xl text-sm hover:bg-white/[0.08] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 bg-[#EA1D2C] text-white font-bold py-3 rounded-xl text-sm hover:bg-[#c8161f] transition-colors"
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Modal de zona de entrega ─────────────────────────────────────────────────

function ZoneModal({
  zone, onClose, onSaved,
}: {
  zone: Zone | 'new';
  onClose: () => void;
  onSaved: (z: Zone) => void;
}) {
  const isNew = zone === 'new';
  const [name, setName] = useState(isNew ? '' : zone.name);
  const [feeMT, setFeeMT] = useState(isNew ? '' : centsToDecimalString(zone.fee_cents));
  const [active, setActive] = useState(isNew ? true : zone.active);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    
    let feeCents: number;
    try {
      feeCents = decimalStringToCents(feeMT.replace(',', '.'));
    } catch {
      alert('Taxa inválida. Usa o formato 50.00');
      return;
    }

    onSaved({
      id: isNew ? crypto.randomUUID() : zone.id,
      name,
      fee_cents: feeCents,
      active,
      sort: isNew ? 0 : zone.sort,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-[4px] z-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSave}
        className="border border-white/[0.08] bg-white/[0.04] backdrop-blur-[12px] shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl w-full max-w-md p-5 space-y-4"
      >
        <h2 className="font-bold text-lg text-[#EA1D2C]">
          {isNew ? 'Nova zona' : 'Editar zona'}
        </h2>

        <div>
          <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Nome da zona</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
            placeholder="ex: Maputo Centro"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#A8A8B0] mb-1">Taxa de entrega (MT)</label>
          <input
            value={feeMT}
            onChange={(e) => setFeeMT(e.target.value)}
            required
            inputMode="decimal"
            className="w-full bg-black/20 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#EA1D2C]"
            placeholder="ex: 50.00"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="zoneActive"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="rounded bg-black/20 border-white/[0.08] text-[#EA1D2C] focus:ring-[#EA1D2C]"
          />
          <label htmlFor="zoneActive" className="text-xs font-semibold text-[#A8A8B0]">
            Ativa
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-white/[0.08] text-[#A8A8B0] font-semibold py-3 rounded-xl text-sm hover:bg-white/[0.08] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 bg-[#EA1D2C] text-white font-bold py-3 rounded-xl text-sm hover:bg-[#c8161f] transition-colors"
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
