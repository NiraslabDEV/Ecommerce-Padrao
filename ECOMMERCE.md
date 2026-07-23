# Ecommerce-Padrão — Plano de transformação

> Template **whitelabel single-tenant** de ecommerce (moda, perfumaria, "qualquer coisa"),
> construído sobre o motor **Delivery OS** (`DeliverysGAB`). Um cliente = um deploy.
> Trocar de cliente = editar `config/brand.ts` + `.env` + assets → migrar → deploy.
>
> **Estratégia:** reaproveitar o motor inteiro, trocar só a *pele* e adicionar o único
> gap real de backend (variantes multi-eixo). Desenvolvido por **Niraslab**.

---

## Decisões fechadas (23/07/2026)

| Tema | Decisão |
|---|---|
| Mercado / moeda / pagamento | **Moçambique** — MZN (`MT`) + M-Pesa/e-Mola (manual) + Paysuite (automático). **Mantém o motor como está.** |
| Entrega | **Local + retirada** (zonas de entrega + levantamento). **Mantém o modelo do motor.** |
| Domínio | Moda / perfumaria / geral (produtos físicos com variação tamanho × cor). |

> Consequência: **não** trocamos gateway nem modelo de frete. O trabalho é **front (re-skin ecommerce)**
> + **variantes multi-eixo**. Muito menos risco do que parecia.

---

## Mapeamento de domínio (delivery → ecommerce)

O backend **não é renomeado** (evita migração gigante e mantém painel/RPCs a funcionar).
A tradução é **cosmética, na UI**:

| Backend (mantém) | Conceito ecommerce | Rótulo na UI |
|---|---|---|
| `menu_items` | Produto | "Produto" |
| `menu_categories` | Categoria / Coleção | "Categoria" |
| `menu_item_variants` | Variação eixo 1 (ex.: Tamanho) | "Tamanho" |
| `menu_addons` | Opções extra (ex.: embrulho, amostra) | "Opções" |
| `delivery_zones` | Zonas de entrega | "Entrega" |
| `orders` / `order_items` | Pedido | "Pedido" |
| Rota `/menu` | Vitrine / catálogo | "Loja" |
| Admin `/cardapio` | Gestão de produtos | "Catálogo" |

> Regra: rename **só em textos visíveis** (`.tsx`, labels do admin). Nunca renomear tabela/coluna/RPC
> nesta fase — quebra o contrato descrito no `README.md` e no `(public)/CLAUDE.md`.

---

## O que se REAPROVEITA (não reescrever)

- Monorepo pnpm+Turbo, Next.js 14 + TS + Tailwind + shadcn/ui.
- Supabase (Postgres + RLS + Realtime + Storage + Auth) e o **contrato de RPCs** `SECURITY DEFINER`.
- Dinheiro em **centavos inteiros**, preços recalculados **no servidor** (`create_order`).
- Whitelabel via `config/brand.ts` → CSS vars (`--st-*`) no `(public)/layout.tsx`.
- Carrinho (`apps/web/utils/useCart.ts`), tracking (`lib/analytics/track.ts`), `formatMT` (`@delivery/core`).
- Pagamentos (`packages/paysuite`): manual + automático + webhook + reconciliação.
- Painel admin completo: pedidos, catálogo, caixa, análise, marketing, promoções, feedback, settings.
- Estoque, cupons/referral, clientes, feedback, lista de espera, analytics.

## O que se ADAPTA (re-skin)

- **Visual**: de "delivery escuro premium" → **boutique clara e elegante** (já iniciado em `config/brand.ts`).
- **Home**: hero de coleção + vitrines por categoria (a estrutura de carrosséis já existe).
- **PLP**: grelha de produtos com **filtros** (tamanho, cor, preço, categoria) + ordenação + busca.
- **PDP**: **galeria de fotos** (múltiplas), seletor de variante em *swatches* (tamanho × cor),
  guia de medidas, "últimas unidades", relacionados.
- **Terminologia**: aplicar o mapeamento acima.

## O que se CONSTRÓI do zero (gaps reais)

1. **Variantes multi-eixo (tamanho × cor) com estoque por SKU** — hoje é 1 eixo só (tamanho) e estoque por item.
   Maior gap técnico. Requer nova tabela de combinações (SKU) + ajuste em `get_menu`/`create_order`/`adjust_stock`.
2. **Galeria de produto** (múltiplas fotos por produto) — hoje é 1 `photo_url`.
3. **Avaliações de produto** (hoje o feedback é por pedido, não por produto).
4. *(Opcional/depois)* wishlist server-side, carrinho abandonado, recomendações.

---

## Roadmap faseado

- **E0 — Scaffold** ✅ *(em curso)*: motor copiado, git novo, identidade renomeada, deps instaladas, integridade verificada.
- **E1 — Rename cosmético + brand demo**: aplicar mapeamento de UI, brand "LUMA" (boutique), assets demo.
- **E2 — Re-skin da vitrine (Home + PLP)**: layout claro, grelha com filtros/ordenção/busca.
- **E3 — PDP ecommerce**: galeria multi-foto, swatches, guia de medidas, relacionados.
- **E4 — Variantes multi-eixo (SKU)**: schema + RPCs + admin + seletor no PDP.
- **E5 — Avaliações de produto** + polimento (SEO, performance, acessibilidade → meta 8.5/10).
- **E6 — Turnkey**: atualizar `setup:client`, docs de onboarding, provar com 2º brand (perfumaria).

> Regra de trabalho (herdada do motor): **uma fase por sessão**, `pnpm lint && pnpm --filter web build` verdes,
> provar whitelabel com 2 brands antes de fechar a fase.
