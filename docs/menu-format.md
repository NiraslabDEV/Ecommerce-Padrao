# Formato canónico de cardápio (`menu.json`)

> O **padrão aceito** para importar produtos. Quando se pede "organiza os produtos do site X",
> o resultado deve respeitar este formato — depois `pnpm menu:import` carrega-o para a BD em segundos.
>
> **Agnóstico de design:** os produtos vivem na base de dados; qualquer front (qualquer designer)
> lê-os via `get_menu()`. Trocar o design do site **não** muda este formato.

## Estrutura

```jsonc
{
  "version": 1,            // opcional
  "currency": "MZN",       // opcional (informativo)
  "categories": [
    {
      "name": "Entradas",          // obrigatório, único por cardápio
      "sort": 1,                    // opcional (ordem; default 0)
      "station": "kitchen",        // opcional: kitchen | bar | cold_kitchen (default kitchen)
      "active": true,              // opcional (default true)
      "items": [
        {
          "name": "Caril de Camarão",   // obrigatório
          "description": "Molho de coco", // opcional
          "price": 130.00,                // obrigatório, MT decimal (número ou string)
          "compare_at_price": 180.00,     // opcional: preço ANTES (riscado). Vazio = sem corte
          "photo_url": "https://...jpg",  // opcional (URL da foto)
          "available": true,              // opcional (default true)
          "track_stock": false,           // opcional (default false)
          "stock_qty": 0,                 // opcional (default 0)
          "sort": 0                       // opcional
        }
      ]
    }
  ]
}
```

> `compare_at_price` (opcional) é o **preço antes** riscado na loja ("de 1200 por 900").
> Vazio/ausente = sem corte. Ignorado se for ≤ `price`. Ver [`precos-e-promocoes.md`](precos-e-promocoes.md).

## Regras

- **Preço em MT decimal** (`130`, `130.00` ou `"25.50"`). É convertido para **centavos inteiros**
  na importação (via `packages/core/money.ts`) — nunca pôr centavos no ficheiro.
- `name` da categoria e do item identificam o registo: re-importar **atualiza** (não duplica).
  Importar **nunca apaga** produtos que não venham no ficheiro.
- `photo_url` deve ser uma URL acessível (a loja mostra-a tal e qual). Sem foto → deixar `""` ou omitir.
- Campos extra (ex.: lixo do scraping de um site) são **ignorados** — só estes campos são lidos.
- **Campanhas de desconto (`promotions`) não entram no ficheiro** — são regras da loja, não propriedades
  do produto. Só o `compare_at_price` (corte manual daquele produto) viaja aqui.
- **O ficheiro manda nos campos que traz:** importar um produto **sem** `compare_at_price` (ou com a coluna
  `preco_antes` vazia) **limpa** o corte manual desse produto. Assim "exportar → editar → importar" é
  previsível: o que está no ficheiro é o que fica.

## Formato CSV (a mesma coisa, em folha de Excel)

1 linha = 1 produto. Cabeçalho (a ordem não importa; só o nome da coluna):

```csv
categoria,ordem_categoria,produto,descricao,preco,preco_antes,foto_url,disponivel,controla_stock,stock,ordem,estacao,categoria_ativa
Perfumes,1,"Nuit, 100ml","Notas de âmbar",900.00,1200.00,https://…/nuit.jpg,sim,sim,7,0,kitchen,sim
```

- **Obrigatórias:** `categoria`, `produto`, `preco`. Todas as outras são opcionais.
- Separador `,` **ou** `;` (Excel em português) — detetado automaticamente.
- Decimais com `.` ou `,` (`900.00`, `900,00`, `1.200,50`).
- Booleanos: `sim`/`nao` (também aceita `true`/`false`, `1`/`0`).
- O ficheiro exportado leva **BOM UTF-8** para o Excel não estragar os acentos.

## Como importar / exportar

**No painel:** `Catálogo` → aba **Importar / Exportar** (exporta CSV ou JSON; importa com pré-visualização).

**No terminal** (usa `.env`: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`):

```bash
# Exportar a loja inteira (o ficheiro volta a entrar pelo import, sem perder nada):
pnpm menu:export produtos.csv        # ou produtos.json

# Pré-visualizar uma importação (não escreve nada):
pnpm menu:import produtos.csv --dry-run

# Importar:
pnpm menu:import produtos.csv        # aceita .csv ou .json
```

Por baixo: `export_menu()` (leitura, `authenticated`) e `import_menu(p_payload jsonb)` (upsert idempotente,
`authenticated`), pelo que o mesmo par de botões pode existir em **qualquer admin UI** futura,
independente do design.

Exemplo completo: [`examples/menu.example.json`](../examples/menu.example.json).
