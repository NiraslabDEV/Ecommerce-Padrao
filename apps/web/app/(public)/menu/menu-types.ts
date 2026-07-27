// Tipos partilhados da vitrine (Home / PLP / PDP). Consomem GET /api/menu.
// Nota: variants/addons são OPCIONAIS no payload — só existem quando o backend
// (get_menu) os devolve. A UI renderiza swatches/filtros só "quando existir".

export type Variant = { id: string; name: string; price_cents: number; is_default?: boolean };
export type Addon = { id: string; name: string; price_cents: number };

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  photo_url: string | null;
  available?: boolean;
  variants?: Variant[];
  addons?: Addon[];
};

export type Category = {
  id: string;
  name: string;
  photo_url?: string | null;
  items: MenuItem[];
};

export type RelatedProduct = {
  id: string;
  name: string;
  price_cents: number;
  photo_url: string | null;
};
