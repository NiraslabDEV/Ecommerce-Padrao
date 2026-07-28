// Tipos partilhados da vitrine (Home / PLP / PDP). Consomem GET /api/menu.
// Nota: variants/addons são OPCIONAIS no payload — só existem quando o backend
// (get_menu) os devolve. A UI renderiza swatches/filtros só "quando existir".

// Corte de preço (raiz CLAUDE §20 / docs/precos-e-promocoes.md): o `price_cents` que
// chega do get_menu() JÁ é o preço a pagar (com desconto aplicado no servidor).
// `compare_at_cents` é só o valor riscado e `discount_pct` o badge — ambos cosméticos.
export type PriceCut = {
  compare_at_cents?: number | null;
  discount_pct?: number;
};

export type Variant = { id: string; name: string; price_cents: number; is_default?: boolean } & PriceCut;
export type Addon = { id: string; name: string; price_cents: number };

export type MenuItem = PriceCut & {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  photo_url: string | null;
  photo_url_2?: string | null;
  video_url?: string | null;
  available?: boolean;
  track_stock?: boolean;
  stock_qty?: number | null;
  variants?: Variant[];
  addons?: Addon[];
};

export type Category = {
  id: string;
  name: string;
  photo_url?: string | null;
  items: MenuItem[];
};

export type RelatedProduct = PriceCut & {
  id: string;
  name: string;
  price_cents: number;
  photo_url: string | null;
};

export type Banner = {
  id: string;
  image_url: string;
  media_type: 'image' | 'video';
  category_id: string | null;
  custom_url: string | null;
};
