# Preços, cortes de preço e promoções — **o padrão**

> Como se baixa preço nesta loja: num produto ("de 1200 por 900"), numa categoria
> ("todos os perfumes -30%") ou na loja inteira ("tudo -50%").
> **Este ficheiro é o contrato.** Qualquer front, qualquer cliente, qualquer designer: as regras são estas.

---

## 1. A regra de ouro

**`menu_items.price_cents` é sempre o preço de tabela do produto. Campanhas nunca o reescrevem.**

Um desconto é uma **regra** guardada à parte. Ligar/desligar uma campanha muda o que a loja cobra
**sem tocar no preço dos produtos** — por isso desligar devolve tudo ao normal, sem perder nada
e sem precisar de "repor preços" à mão.

Há **duas** formas de cortar preço, e só duas:

| # | Onde | Para quê | Guardado em |
|---|---|---|---|
| **1** | `menu_items.compare_at_price_cents` | Corte manual de **um** produto: "de 1200 **por** 900" | coluna do produto |
| **2** | tabela `promotions` | Campanha em massa: **loja inteira**, **categoria** ou **um produto**, em **%** ou **MT fixo**, com data de início/fim opcional | 1 linha por campanha |

No caso **1** o dono edita os dois preços do produto (o novo e o antigo, riscado).
No caso **2** o preço do produto fica quieto e a campanha desconta por cima.

---

## 2. Como o preço final é calculado

Uma única função no servidor — `public.effective_price()` — decide tudo:

```
desconto  = MAIOR desconto entre as campanhas ativas que tocam este produto
preço     = price_cents − desconto                     (nunca abaixo de 0)
riscado   = MAIOR(compare_at_price_cents, price_cents) (null se não for maior que o preço)
badge %   = arredondar((1 − preço / riscado) × 100)
```

Regras fechadas:

- **Os descontos NÃO acumulam.** Loja -50% + Perfumes -30% no mesmo produto → **-50%** (vence o maior),
  nunca -65% nem -80%.
- **Percentagem arredonda ao cêntimo** (`round`), nunca float. Dinheiro é sempre centavos inteiros.
- **Desconto fixo (MT) nunca desconta mais do que o preço** — o preço final tem piso em 0.
- **Campanha desligada, agendada para o futuro ou expirada não conta.**
- **`compare_at_price_cents` menor ou igual ao preço é ignorado** — a loja não mostra desconto falso.
- **Variantes** (tamanho/cor) entram na campanha: o desconto aplica-se ao preço da variante escolhida.
- **Adicionais (`menu_addons`) NÃO são descontados** — somam depois do desconto.
- **Item de brinde (`is_gift`) fica sempre a 0** — cupons e brindes são outro mecanismo (ver `CLAUDE.md` §17).
- O **cupom de indicação** (`referral_code`) incide sobre o subtotal **já com** os cortes aplicados.

---

## 3. Quem usa esta função (é o mesmo preço em todo o lado)

| Caminho | Função | O que devolve/faz |
|---|---|---|
| Vitrine (`GET /api/menu` → `get_menu()`) | `effective_price(...)` | `price_cents` já **com desconto**, mais `compare_at_cents` (riscado) e `discount_pct` (badge) |
| "Quem viu isto também viu" (`get_related_products`) | `effective_price(...)` | idem |
| **Cobrança** (`create_order()`) | `effective_price_cents(...)` | recalcula o preço de cada linha do zero e grava em `order_items.unit_price_cents` |
| Preview no admin/front | `packages/core/src/pricing.ts` | **espelho em TypeScript** da mesma regra — só para desenhar |

> ⚠️ **O client nunca decide preço.** O que o carrinho manda são nomes, quantidades, variante e adicionais.
> Se alguém adulterar o payload com outro preço, o `create_order` ignora e cobra o preço da BD.
> Alterar a regra obriga a mudar **os dois** lados (SQL + `pricing.ts`) — os testes cobrem ambos.

---

## 4. Como o dono faz (painel → **Catálogo**)

### 4.1 Baixar o preço de **um** produto ("de tanto por tanto")
`Catálogo` → editar o produto → preencher **Preço** (o que o cliente paga) e **Preço antes** (o riscado).
A loja mostra `~~1200 MT~~ 900 MT  -25%`. Para acabar a promoção: apagar o "Preço antes".

### 4.2 Baixar **uma categoria** ("todos os perfumes -30%")
`Catálogo` → aba **Promoções** → *Aplica a*: **Uma categoria** → escolher a categoria → **30%** → **Criar campanha**.
Todos os produtos daquela categoria passam a mostrar o preço cortado, com o preço antigo riscado.

### 4.3 Baixar a **loja inteira** ("tudo -50%")
`Catálogo` → **Promoções** → *Aplica a*: **Loja inteira** → **50%** → **Criar campanha**.

### 4.4 Agendar (Black Friday, fim de semana…)
No formulário, preencher **Começa** / **Acaba**. A campanha liga e desliga sozinha na hora marcada.

### 4.5 Acabar uma campanha
Botão **Ligada/Desligada** (fica registada, pode voltar) ou **✕** para apagar. Os preços voltam ao normal na hora.

---

## 5. Importar / exportar a lista de produtos

Formato canónico: [`docs/menu-format.md`](menu-format.md). Dois caminhos, o mesmo formato:

| Onde | Como |
|---|---|
| **Painel** | `Catálogo` → aba **Importar / Exportar** → *Exportar CSV/JSON*, ou escolher ficheiro → pré-visualizar → **Importar para a loja** |
| **Terminal** | `pnpm menu:export produtos.csv` · `pnpm menu:import produtos.csv [--dry-run]` |

Regras:

- **O nome é a chave.** Importar um produto com nome já existente **atualiza-o**; nome novo **cria**.
  Importar **nunca apaga** produtos que não estejam no ficheiro.
- **Preços no ficheiro em MT decimal** (`900`, `900.00` ou `900,00`) — a conversão para centavos é feita
  pelo `money.ts`. Nunca pôr centavos no ficheiro.
- A coluna **`preco_antes`** é o corte manual do §4.1 (`compare_at_price_cents`). Vazia = sem corte.
  **Campanhas (`promotions`) não vão no ficheiro** — são regras, não propriedades do produto.
- O CSV abre no Excel (BOM UTF-8) e aceita separador `,` ou `;` e decimais com `,` ou `.`.

---

## 6. Onde isto vive no código

| Peça | Ficheiro |
|---|---|
| Regra em SQL (autoridade) | `supabase/migrations/20260728000003_promotions.sql` — `promo_discount_cents`, `effective_price_cents`, `effective_price` |
| Espelho em TS (preview + testes) | `packages/core/src/pricing.ts` |
| Testes da regra (sem BD) | `packages/core/src/__tests__/pricing.test.ts` |
| Testes contra a BD | `packages/db/tests/promotions.test.ts` |
| Import/export (formato + CSV) | `packages/core/src/menu-import.ts` · `menu-export.ts` |
| CLI | `scripts/import-menu.ts` · `scripts/export-menu.ts` |
| Painel | `apps/web/app/(admin)/promotions-section.tsx` · `menu-io-section.tsx` · `menu-section.tsx` |
| Loja (só desenho) | `apps/web/app/(public)/menu/menu-ui.tsx` (`PriceWithCut`, `DiscountBadge`) |

---

## 7. O que NUNCA fazer

- ❌ Reescrever `price_cents` em massa para aplicar uma campanha (perde o preço original).
- ❌ Calcular desconto no client e mandá-lo no pedido — o servidor recalcula sempre.
- ❌ Somar descontos de campanhas diferentes.
- ❌ Float ou percentagem em `numeric` no meio do caminho: centavos inteiros, arredondamento só no fim.
- ❌ Mostrar `compare_at` menor ou igual ao preço (desconto falso).
- ❌ Descontar adicionais ou item de brinde.
- ❌ Dar `select` de `promotions` ao `anon` — os preços já saem calculados do `get_menu()`.
