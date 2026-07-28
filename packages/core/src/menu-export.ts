import { centsToDecimalString, type Cents } from './money';

/**
 * EXPORTAÇÃO da lista de produtos — o outro lado do `menu-import.ts`.
 *
 * Formato canónico = o MESMO `menu.json` da importação (docs/menu-format.md):
 * o que sai do export volta a entrar pelo import sem perder nada. O CSV é apenas
 * uma projeção plana (1 linha = 1 produto) para abrir no Excel/Sheets.
 *
 * Preços saem em MT decimal (nunca centavos no ficheiro) — a conversão vive no
 * money.ts, igual à importação.
 */

// ── Linhas cruas da BD (o chamador decide se as busca com service role ou como staff) ──

export interface ExportCategoryRow {
  id: string;
  name: string;
  sort?: number | null;
  station?: string | null;
  active?: boolean | null;
}

export interface ExportItemRow {
  category_id: string;
  name: string;
  description?: string | null;
  price_cents: number;
  compare_at_price_cents?: number | null;
  photo_url?: string | null;
  available?: boolean | null;
  track_stock?: boolean | null;
  stock_qty?: number | null;
  sort?: number | null;
}

// ── Formato canónico de saída (igual ao aceite pelo importador) ───────────────

export interface MenuExportItem {
  name: string;
  description: string;
  price: string;
  compare_at_price?: string;
  photo_url: string;
  available: boolean;
  track_stock: boolean;
  stock_qty: number;
  sort: number;
}

export interface MenuExportCategory {
  name: string;
  sort: number;
  station: string;
  active: boolean;
  items: MenuExportItem[];
}

export interface MenuExport {
  version: 1;
  currency: 'MZN';
  exported_at: string;
  categories: MenuExportCategory[];
}

/** Agrupa itens por categoria e converte centavos → MT decimal. */
export function buildMenuExport(
  categories: ExportCategoryRow[],
  items: ExportItemRow[],
  now: Date = new Date(),
): MenuExport {
  const byCategory = new Map<string, ExportItemRow[]>();
  for (const item of items) {
    const list = byCategory.get(item.category_id);
    if (list) list.push(item);
    else byCategory.set(item.category_id, [item]);
  }

  const categoriesOut = categories
    .map((c) => ({
      name: c.name,
      sort: c.sort ?? 0,
      station: c.station ?? 'kitchen',
      active: c.active ?? true,
      items: (byCategory.get(c.id) ?? [])
        .slice()
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        .map((i): MenuExportItem => {
          const item: MenuExportItem = {
            name: i.name,
            description: i.description ?? '',
            price: centsToDecimalString(i.price_cents as Cents),
            photo_url: i.photo_url ?? '',
            available: i.available ?? true,
            track_stock: i.track_stock ?? false,
            stock_qty: i.stock_qty ?? 0,
            sort: i.sort ?? 0,
          };
          // só escreve o "de X" quando ele existe e é maior que o preço
          if (i.compare_at_price_cents && i.compare_at_price_cents > i.price_cents) {
            item.compare_at_price = centsToDecimalString(i.compare_at_price_cents as Cents);
          }
          return item;
        }),
    }))
    // categoria sem produtos não é exportada (o importador exige ≥ 1 item)
    .filter((c) => c.items.length > 0);

  return {
    version: 1,
    currency: 'MZN',
    exported_at: now.toISOString(),
    categories: categoriesOut,
  };
}

/**
 * Achata o payload da RPC `export_menu()` (categorias com `items` aninhados)
 * nas linhas planas que o `buildMenuExport` consome.
 */
export function rowsFromExportRpc(payload: unknown): {
  categories: ExportCategoryRow[];
  items: ExportItemRow[];
} {
  const raw = (payload ?? {}) as { categories?: (ExportCategoryRow & { items?: ExportItemRow[] })[] };
  const categories: ExportCategoryRow[] = [];
  const items: ExportItemRow[] = [];

  for (const c of raw.categories ?? []) {
    categories.push({ id: c.id, name: c.name, sort: c.sort, station: c.station, active: c.active });
    for (const i of c.items ?? []) items.push({ ...i, category_id: c.id });
  }

  return { categories, items };
}

// ── CSV ───────────────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  'categoria',
  'ordem_categoria',
  'produto',
  'descricao',
  'preco',
  'preco_antes',
  'foto_url',
  'disponivel',
  'controla_stock',
  'stock',
  'ordem',
  'estacao',
  'categoria_ativa',
] as const;

const BOM = '\uFEFF';

const csvEscape = (value: string): string =>
  /[",;\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const bool = (b: boolean) => (b ? 'sim' : 'nao');

/** Serializa o export canónico como CSV (1 linha por produto), pronto para Excel. */
export function menuToCsv(menu: MenuExport): string {
  const lines = [CSV_COLUMNS.join(',')];

  for (const c of menu.categories) {
    for (const i of c.items) {
      lines.push(
        [
          c.name,
          String(c.sort),
          i.name,
          i.description,
          i.price,
          i.compare_at_price ?? '',
          i.photo_url,
          bool(i.available),
          bool(i.track_stock),
          String(i.stock_qty),
          String(i.sort),
          c.station,
          bool(c.active),
        ]
          .map(csvEscape)
          .join(','),
      );
    }
  }

  // BOM: sem ele o Excel abre "âmbar" como "Ã¢mbar".
  return BOM + lines.join('\r\n') + '\r\n';
}

/** Divide uma linha CSV respeitando aspas duplas ("" = aspa literal). */
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** Quebra o ficheiro em linhas lógicas (uma célula pode conter \n dentro de aspas). */
function csvLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      quoted = !quoted;
      current += ch;
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') lines.push(current);
  return lines.filter((l) => l.trim() !== '');
}

/** Remove acentos e normaliza o cabeçalho ("Descrição" → "descricao"). */
const normalizeHeader = (h: string): string =>
  h
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');

const HEADER_ALIASES: Record<string, string> = {
  categoria: 'categoria', category: 'categoria', seccao: 'categoria', coleccao: 'categoria',
  produto: 'produto', nome: 'produto', item: 'produto', artigo: 'produto',
  preco: 'preco', price: 'preco', preco_atual: 'preco', valor: 'preco',
  preco_antes: 'preco_antes', preco_original: 'preco_antes', preco_riscado: 'preco_antes',
  compare_at_price: 'preco_antes', de: 'preco_antes',
  descricao: 'descricao', description: 'descricao',
  foto_url: 'foto_url', foto: 'foto_url', imagem: 'foto_url', photo_url: 'foto_url',
  disponivel: 'disponivel', available: 'disponivel', ativo: 'disponivel',
  controla_stock: 'controla_stock', track_stock: 'controla_stock',
  stock: 'stock', stock_qty: 'stock', quantidade: 'stock',
  ordem: 'ordem', sort: 'ordem',
  ordem_categoria: 'ordem_categoria',
  estacao: 'estacao', station: 'estacao',
  categoria_ativa: 'categoria_ativa',
};

/** "1.200,50" / "1200,50" / "1200.50" → "1200.50" (aceita o Excel em português). */
function parseDecimal(raw: string): string {
  const s = raw.replace(/\s|MT|mt/g, '').trim();
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    return s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')   // 1.200,50 → 1200.50
      : s.replace(/,/g, '');                      // 1,200.50 → 1200.50
  }
  return hasComma ? s.replace(',', '.') : s;
}

const TRUTHY = new Set(['sim', 's', 'true', '1', 'verdadeiro', 'yes', 'y', 'x']);
const FALSY = new Set(['nao', 'n', 'false', '0', 'falso', 'no']);

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = normalizeHeader(raw);
  if (v === '') return fallback;
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return fallback;
}

/**
 * CSV → objeto no formato canónico (pronto para `normalizeMenuImport`).
 * Aceita separador `,` ou `;` (Excel pt), decimais com `,` ou `.`, BOM e CRLF.
 * Colunas obrigatórias: `categoria`, `produto`, `preco`. As outras são opcionais.
 */
export function csvToMenu(csv: string): unknown {
  const text = csv.replace(/^\uFEFF/, '');
  const lines = csvLines(text);
  if (lines.length === 0) throw new Error('Ficheiro CSV vazio.');

  // Sniffing do separador pela linha de cabeçalho (fora de aspas).
  const headerLine = lines[0];
  const delimiter = (headerLine.split(';').length > headerLine.split(',').length) ? ';' : ',';

  const header = splitCsvLine(headerLine, delimiter).map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? normalizeHeader(h));
  for (const required of ['categoria', 'produto', 'preco']) {
    if (!header.includes(required)) {
      throw new Error(`Falta a coluna obrigatória "${required}" no CSV (cabeçalho lido: ${header.join(', ')}).`);
    }
  }

  const categories = new Map<string, { name: string; sort: number; station: string; active: boolean; items: unknown[] }>();

  for (let n = 1; n < lines.length; n++) {
    const cells = splitCsvLine(lines[n], delimiter);
    const get = (col: string): string | undefined => {
      const idx = header.indexOf(col);
      return idx === -1 ? undefined : cells[idx];
    };

    const categoryName = (get('categoria') ?? '').trim();
    const itemName = (get('produto') ?? '').trim();
    if (categoryName === '' && itemName === '') continue; // linha em branco

    if (categoryName === '') throw new Error(`Linha ${n + 1}: falta a categoria do produto "${itemName}".`);
    if (itemName === '') throw new Error(`Linha ${n + 1}: falta o nome do produto (categoria "${categoryName}").`);

    const priceRaw = (get('preco') ?? '').trim();
    if (priceRaw === '') throw new Error(`Falta o preço no produto "${itemName}" (linha ${n + 1}).`);

    const compareRaw = (get('preco_antes') ?? '').trim();

    let category = categories.get(categoryName);
    if (!category) {
      category = {
        name: categoryName,
        sort: Number(parseDecimal(get('ordem_categoria') ?? '0')) || 0,
        station: (get('estacao') ?? 'kitchen').trim() || 'kitchen',
        active: parseBool(get('categoria_ativa'), true),
        items: [],
      };
      categories.set(categoryName, category);
    }

    category.items.push({
      name: itemName,
      description: (get('descricao') ?? '').trim(),
      price: parseDecimal(priceRaw),
      compare_at_price: compareRaw === '' ? null : parseDecimal(compareRaw),
      photo_url: (get('foto_url') ?? '').trim(),
      available: parseBool(get('disponivel'), true),
      track_stock: parseBool(get('controla_stock'), false),
      stock_qty: Number(parseDecimal(get('stock') ?? '0')) || 0,
      sort: Number(parseDecimal(get('ordem') ?? '0')) || 0,
    });
  }

  if (categories.size === 0) throw new Error('O CSV não tem nenhum produto (só o cabeçalho?).');

  return { version: 1, currency: 'MZN', categories: [...categories.values()] };
}
