/**
 * Exportação da lista de produtos (JSON canónico + CSV para Excel).
 *
 * Regra do padrão: o que sai do export tem de voltar a entrar pelo import
 * sem perder nada (round-trip). O ficheiro é a mesma coisa que docs/menu-format.md
 * descreve — o CSV é só uma projeção plana do mesmo formato.
 */
import { describe, it, expect } from 'vitest';
import {
  buildMenuExport,
  menuToCsv,
  csvToMenu,
  rowsFromExportRpc,
  type ExportCategoryRow,
  type ExportItemRow,
} from '../menu-export';
import { normalizeMenuImport } from '../menu-import';

const cats: ExportCategoryRow[] = [
  { id: 'c1', name: 'Perfumes', sort: 1, station: 'kitchen', active: true },
  { id: 'c2', name: 'Roupa', sort: 2, station: 'bar', active: false },
];

const items: ExportItemRow[] = [
  {
    category_id: 'c1',
    name: 'Perfume "Nuit", 100ml',
    description: 'Notas de âmbar, baunilha',
    price_cents: 90000,
    compare_at_price_cents: 120000,
    photo_url: 'https://cdn.example.com/nuit.jpg',
    available: true,
    track_stock: true,
    stock_qty: 7,
    sort: 0,
  },
  {
    category_id: 'c2',
    name: 'T-shirt',
    description: null,
    price_cents: 45000,
    compare_at_price_cents: null,
    photo_url: null,
    available: false,
    track_stock: false,
    stock_qty: 0,
    sort: 1,
  },
];

describe('buildMenuExport — formato canónico menu.json', () => {
  const menu = buildMenuExport(cats, items);

  it('agrupa itens por categoria, em MT decimal (não centavos)', () => {
    expect(menu.categories).toHaveLength(2);
    expect(menu.categories[0].name).toBe('Perfumes');
    expect(menu.categories[0].items[0].price).toBe('900.00');
    expect(menu.categories[0].items[0].compare_at_price).toBe('1200.00');
  });

  it('omite compare_at_price quando não há corte de preço', () => {
    expect(menu.categories[1].items[0].compare_at_price).toBeUndefined();
  });

  it('preserva categorias/itens desativados (o export é a loja inteira)', () => {
    expect(menu.categories[1].active).toBe(false);
    expect(menu.categories[1].items[0].available).toBe(false);
  });

  it('o resultado é re-importável (round-trip pelo importador canónico)', () => {
    const normalized = normalizeMenuImport(menu);
    expect(normalized.categories[0].items[0].price_cents).toBe(90000);
    expect(normalized.categories[0].items[0].compare_at_price_cents).toBe(120000);
    expect(normalized.categories[1].items[0].compare_at_price_cents).toBe(null);
  });

  it('categorias vazias não são exportadas (o import exige ≥ 1 item)', () => {
    const menuVazio = buildMenuExport([cats[0]], []);
    expect(menuVazio.categories).toEqual([]);
  });
});

describe('rowsFromExportRpc — payload da RPC export_menu()', () => {
  it('achata categorias com items aninhados em linhas planas', () => {
    const { categories, items } = rowsFromExportRpc({
      categories: [
        {
          id: 'c1',
          name: 'Perfumes',
          sort: 1,
          station: 'kitchen',
          active: true,
          items: [{ name: 'Nuit', price_cents: 90000, compare_at_price_cents: 120000, sort: 0 }],
        },
      ],
    });
    expect(categories).toEqual([{ id: 'c1', name: 'Perfumes', sort: 1, station: 'kitchen', active: true }]);
    expect(items[0].category_id).toBe('c1');
    expect(buildMenuExport(categories, items).categories[0].items[0].compare_at_price).toBe('1200.00');
  });

  it('aguenta payload vazio', () => {
    expect(rowsFromExportRpc(null)).toEqual({ categories: [], items: [] });
  });
});

describe('menuToCsv / csvToMenu — folha de Excel', () => {
  const csv = menuToCsv(buildMenuExport(cats, items));

  it('tem cabeçalho em português e uma linha por produto', () => {
    const linhas = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    expect(linhas[0]).toBe(
      'categoria,ordem_categoria,produto,descricao,preco,preco_antes,foto_url,disponivel,controla_stock,stock,ordem,estacao,categoria_ativa',
    );
    expect(linhas).toHaveLength(3); // cabeçalho + 2 produtos
  });

  it('leva BOM para o Excel não estragar os acentos', () => {
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('âmbar');
  });

  it('escapa vírgulas e aspas dentro dos campos', () => {
    expect(csv).toContain('"Perfume ""Nuit"", 100ml"');
  });

  it('volta a JSON idêntico ao original (round-trip CSV)', () => {
    const voltou = normalizeMenuImport(csvToMenu(csv));
    const original = normalizeMenuImport(buildMenuExport(cats, items));
    expect(voltou).toEqual(original);
  });

  it('aceita ponto-e-vírgula (Excel em português) e vírgula decimal', () => {
    const excel = 'categoria;produto;preco;preco_antes\nPerfumes;Nuit;900,00;1200,00';
    const menu = normalizeMenuImport(csvToMenu(excel));
    expect(menu.categories[0].items[0].price_cents).toBe(90000);
    expect(menu.categories[0].items[0].compare_at_price_cents).toBe(120000);
  });

  it('aceita sim/nao além de true/false nos booleanos', () => {
    const csvPt = 'categoria,produto,preco,disponivel,controla_stock\nPerfumes,Nuit,900,nao,sim';
    const menu = normalizeMenuImport(csvToMenu(csvPt));
    expect(menu.categories[0].items[0].available).toBe(false);
    expect(menu.categories[0].items[0].track_stock).toBe(true);
  });

  it('só exige categoria/produto/preco — as outras colunas são opcionais', () => {
    const minimo = 'categoria,produto,preco\nPerfumes,Nuit,900';
    const menu = normalizeMenuImport(csvToMenu(minimo));
    expect(menu.categories[0].items[0].price_cents).toBe(90000);
    expect(menu.categories[0].items[0].available).toBe(true);
  });

  it('erro claro quando falta uma coluna obrigatória', () => {
    expect(() => csvToMenu('produto,preco\nNuit,900')).toThrow(/categoria/i);
  });

  it('erro claro quando uma linha não tem preço', () => {
    expect(() => csvToMenu('categoria,produto,preco\nPerfumes,Nuit,')).toThrow(/Nuit/);
  });
});
