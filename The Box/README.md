# Delivery OS — Template Whitelabel (single-tenant)

> Sistema de **encomendas online com entrega/levantamento** para restaurantes em Moçambique.
> Cliente abre o site → cardápio → carrinho → **Levantamento** ou **Entrega** (taxa por zona) →
> agenda **Agora**/horário → paga (**manual** por comprovativo M-Pesa/e-Mola, ou **automático** via Paysuite) →
> o dono vê no painel + email + (opcional) **impressora térmica 24/7**.
>
> **Single-tenant:** um restaurante = um deploy. Para cada cliente novo: clonar → editar `config/brand.ts` + `.env` →
> migrar → configurar menu/zonas no admin → deploy. Desenvolvido por **Niraslab** (niraslab.dev@gmail.com).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| UI | Tailwind + shadcn/ui (tema escuro + dourado HawSmash) |
| Backend/DB | Supabase (Postgres + RLS + Realtime + Storage + Auth) |
| Pagamentos | Manual (comprovativo M-Pesa/e-Mola) + Paysuite (automático) |
| Email | Resend |
| Impressora | ESC/POS TCP 9100 via `services/print-bridge` (mini-PC local) |
| Monorepo | pnpm workspaces + Turborepo |

```bash
pnpm dev            # web em localhost:3000
pnpm test           # vitest (todos os pacotes)
pnpm lint           # eslint + tsc
pnpm db:migrate     # supabase db reset (migrations + seed)
pnpm setup:client   # valida .env + brand.ts e aplica migrations  ⭐ turnkey
pnpm bridge:dev     # print-bridge com impressora simulada (console)
```

---

## ⭐ Instalar para um cliente novo (turnkey, < 30 min)

> Não é preciso tocar em nenhuma lógica — só configuração.

### 1. Clonar e instalar
```bash
git clone <repo> cliente-x && cd cliente-x
pnpm install
```

### 2. Marca (`config/brand.ts`)
```bash
cp config/brand.example.ts config/brand.ts
```
Editar `name`, `tagline`, `theme` (cores), `social`. Colocar logo/assets em `apps/web/public/assets`.

### 3. Variáveis de ambiente (`.env`)
```bash
cp .env.example .env
```
Preencher Supabase (URL + anon + service role), `OWNER_EMAIL`, `APP_BASE_URL`, e — se quiser emails — `RESEND_API_KEY`/`RESEND_FROM_EMAIL`. Pagamento começa em `PAYMENT_PROVIDER=manual`.

### 4. Base de dados
```bash
pnpm setup:client          # valida .env + brand.ts e corre supabase db reset
# (ou só validar, sem tocar na BD:)
pnpm setup:check
```
`setup:client` **falha com mensagem clara** se faltar uma variável obrigatória, se ainda houver valores de exemplo, ou se `PAYMENT_PROVIDER=paysuite` sem as chaves Paysuite.

### 5. Configurar no admin
Login do dono (Supabase Auth) → editar `settings` (números M-Pesa/e-Mola, morada de levantamento, horários, `accepting_orders`), cardápio (categorias/itens) e zonas de entrega.

### 6. Deploy
Web em **Vercel** ou **Railway** (é um app Next.js standard) — ligar o repo e definir as mesmas env vars. `APP_BASE_URL` tem de apontar para o domínio de produção.

### 7. (Opcional) Impressora térmica
Instalar `services/print-bridge` no mini-PC local 24/7 do restaurante. Ver secção própria abaixo.

> Checklist imprimível por cliente: [`docs/onboarding-checklist.md`](docs/onboarding-checklist.md)

---

## Contrato do backend (para conectar um front novo)

O front comunica **só** por RPCs `SECURITY DEFINER` no Supabase — `anon` nunca faz SELECT direto.
Trocar de design = trocar `config/brand.ts` + o front; o contrato abaixo não muda.

### Públicas (`anon`) — loja do cliente
| RPC | Para quê |
|---|---|
| `get_menu()` | Cardápio (categorias + itens disponíveis), zonas de entrega, `accepting_orders` |
| `create_order(p_payload jsonb)` | Cria o pedido. **O servidor recalcula preços e taxa** — o payload só traz nomes, quantidades, zona, horário, dados do cliente |
| `get_order_status(p_order_id uuid)` | Estado do pedido (polling na página de acompanhamento) |
| `attach_payment_proof(p_order_id uuid, p_path text)` | Liga o comprovativo (fluxo manual) ao pedido |
| `submit_feedback(p_order_id uuid, rating int, ...)` | Feedback do cliente |
| `join_waitlist(name, phone, ...)` | Lista de espera quando a loja está fechada |

### Staff (`authenticated`) — painel
`get_orders(jsonb)`, `get_order_stats()`, `advance_order(uuid, event, reason)` (Aprovar/Negar/avançar estado),
`get_cash_dashboard()`, `open_cash_session()`, `close_cash_session(int, text)`, `adjust_stock(...)`,
`admin_list_feedbacks(...)`, `admin_list_waitlist(...)`, `get_device_status()`, `upsert_heartbeat(text, text)`.

> Regras de ouro (CLAUDE.md §12): dinheiro sempre em **centavos inteiros**; preços/taxas **só no servidor**;
> nunca confiar no client; o bucket `payment-proofs` é **privado** (usar `createSignedUrl`).

---

## Print-bridge (impressora térmica, opcional)

Node leve no **mini-PC local** do restaurante (não na cloud — precisa de TCP para a impressora na LAN).
Faz poll de `print_jobs.queued` (3s) → ESC/POS → TCP `PRINTER_IP:9100` → marca `printed`.
Retry 3× com backoff; falha **nunca** esconde o pedido no painel.

```bash
cd services/print-bridge && cp .env.example .env   # SUPABASE_URL, SERVICE_ROLE_KEY, PRINTER_IP
pnpm bridge:dev    # simulador: imprime o cupom decodificado no console (sem hardware)
```

O `print_job` é criado quando o pedido fica `paid` (Paysuite) ou `approved` (manual).

### Formato do Cupom Térmico (ESC/POS — 58 mm)

Baseado no padrão local moçambicano (ref: PRAIA SHOPPING LDA, Maputo).
Implementado em `services/print-bridge/src/escpos.ts`.

```
================================================
         NOME DO RESTAURANTE
         www.restaurante.co.mz
================================================
PEDIDO: ENC-0042          14/06/2026  14:25
================================================
CLIENTE: MARIA ALBERTINA
TEL:     +258 84 123 456
================================================
** ENTREGA **
Zona:    Sommerschield
Morada:  Av. Julius Nyerere, 100
HORARIO: 14:30
- - - - (ou para levantamento) - - - -
** LEVANTAMENTO **
HORARIO: AGORA
================================================
Descricao              Qty       Total
------------------------------------------------
Caril de Camarao        x2    130.00 MT
  > bem apimentado
Sumo de Manga           x1     25.00 MT
================================================
Subtotal:                     155.00 MT
Taxa de entrega:               20.00 MT
================================================
TOTAL:                        175.00 MT
================================================
[ PAGO VIA M-PESA ]
- - ou - -
[ PAGAR NA ENTREGA/LEVANTAMENTO ]
================================================
Obrigado! Bom apetite!
14/06/2026  14:25:33
================================================
```

**Observações do padrão (análise PRAIA SHOPPING LDA):**
- Papel 58 mm (~48 chars por linha a 12 cpi)
- Nome do estabelecimento: **centrado, negrito, maiúsculas**
- Separadores: `===…` (linha completa)
- Itens: descrição (esquerda) + qty + total (direita); notas indentadas com `>`
- Totais: subtotal + taxa + **TOTAL em negrito/tamanho duplo** (taxa só aparece em entrega)
- Pagamento: bloco `[ PAGO VIA … ]` em negrito
- Rodapé: mensagem curta + data/hora; corte após feed de 3 linhas (`GS V 0x00`)
- Codepage: CP1252 (WPC1252) — acentos portugueses

Detalhes de produção (systemd, troubleshooting) em [`services/print-bridge`](services/print-bridge).

---

## Variáveis de ambiente

Ver [`.env.example`](.env.example) (web) e [`services/print-bridge/.env.example`](services/print-bridge/.env.example) (mini-PC).
Obrigatórias na web: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_EMAIL`, `APP_BASE_URL`.
Paysuite exige ainda `PAYSUITE_API_KEY` + `PAYSUITE_WEBHOOK_SECRET` (+ `CRON_SECRET` para o cron de reconciliação).

---

Parte do **Delivery OS** — Niraslab. Roteiro de fases em [`ROADMAP.md`](ROADMAP.md).
