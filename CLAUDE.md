# CLAUDE.md — Delivery OS (template whitelabel single-tenant)

> Sistema de **encomendas online com entrega/levantamento** para restaurantes em Moçambique.
> Cliente abre o site → cardápio → carrinho → escolhe **Levantamento** ou **Entrega** (taxa por zona) →
> agenda **Agora** ou um **horário** do dia → paga (**manual**: vê M-Pesa/e-Mola e envia comprovativo · ou
> **automático** via Paysuite) → o dono vê o pedido no painel interno + email + (opcional) **impressora térmica 24/7**.
>
> **NÃO é multi-tenant.** Um restaurante = um deploy. Para cada cliente novo: clonar o repo, editar
> `config/brand.ts` + `.env`, configurar menu/zonas no admin, fazer deploy. Isto é o **template de revenda**.
> Desenvolvido por **Niraslab** (niraslab.dev@gmail.com).

---

## ⚡ COMO TRABALHAR NESTE REPO (regras para o agente de IA)

1. **Uma fase do `ROADMAP.md` por sessão.** Nunca antecipar fases futuras.
2. **Antes de codar:** ler este ficheiro + a fase atual no ROADMAP. Listar os ficheiros que vais criar/alterar
   e o plano de testes. Esperar confirmação se houver dúvida de escopo.
3. **Reaproveitar antes de inventar.** Grande parte do motor já existe no projeto **QR MESAS**
   (`C:\Users\Gabriel\Desktop\QR MESAS`). Copiar/adaptar (ver secção 13 — Reaproveitamento), não reescrever.
4. **Skeleton-first → tests-before-code → implementação** (Método Akita). Nenhuma lógica de domínio sem teste Vitest escrito ANTES.
5. **Single-tenant é uma decisão fechada.** NUNCA adicionar `tenant_id`, `qr_token`, planos comerciais ou
   gating por plano. Se aparecer no código copiado do QR MESAS, **remover**.
6. **Dinheiro sempre em centavos inteiros.** Preços só existem no servidor. O client envia nomes e quantidades; o servidor recalcula tudo.
7. **Copiar os padrões canónicos da secção 14** (RLS, idempotência de webhook, dinheiro, estoque atómico) em vez de inventar variações.
8. **Definition of Done de toda fase:** `pnpm lint && pnpm test` verdes + checklist da fase no ROADMAP marcado + commit convencional (`feat(scope): ...`).
9. Em caso de ambiguidade: escolher a opção mais simples que respeite a secção 12 ("O que NUNCA fazer") e documentar com `// DECISÃO:`.

---

## 1. Visão do produto

- **O que é:** um site de encomendas pronto a vender. O Niraslab vende delivery a restaurantes; cada um recebe
  uma cópia deste sistema, conectada à sua marca, números de pagamento e cardápio.
- **Mercado:** Maputo → Moçambique. UI 100% em **português**. Moeda **MZN (MT)**.
- **Diferencial:** integração nativa M-Pesa/e-Mola (manual + Paysuite), operação confiável com internet instável,
  impressora térmica opcional, e um painel interno bonito (Pedidos / Caixa / Análise / Feedback / Lista de Espera).
- **Whitelabel:** identidade visual e segredos vêm de `config/brand.ts` + `.env`. Dados de negócio
  (menu, zonas, horários, números de pagamento) vêm do admin/BD. Trocar de cliente NÃO exige tocar na lógica.

### 1.1 Não há planos. Não há gating.
Este é um produto entregue por instância. Toda a feature está sempre ligada. (Contraste com o QR MESAS, que é SaaS com planos — aqui isso não existe.)

---

## 2. Stack (decisões fechadas — não mudar sem ADR em `/docs/decisions`)

| Camada | Tecnologia | Motivo |
|---|---|---|
| Frontend | Next.js 14+ (App Router) + TypeScript | Loja do cliente + painel admin no mesmo código; route handlers para webhooks/emails |
| UI | Tailwind CSS + shadcn/ui | Velocidade; tema whitelabel via CSS vars |
| Visual | Tema escuro + dourado **portado do HawSmash** (`C:\Users\Gabriel\Desktop\HawSmash\admin.css`) | Igual às screenshots do dono |
| Estado no client | TanStack Query | Cache, retry, reconexão |
| Backend/DB | Supabase (Postgres + RLS + Realtime + Auth + Storage) | RLS simples (1 restaurante), realtime no painel, storage para comprovativos |
| Validação | Zod em toda boundary | Inputs nunca confiáveis |
| Pagamentos | Manual (comprovativo) + Paysuite (M-Pesa/e-Mola/cartão) | Manual cobre todos; Paysuite automatiza |
| Email | Resend (default) via route handler — swappable por SMTP | Pedido novo → dono; pagamento confirmado/negado → cliente |
| Impressão | Print-bridge local (Node) → ESC/POS TCP 9100 | Portado do QR MESAS; redundância, nunca acopla |
| Hosting | Vercel (web) + Supabase Cloud; print-bridge num mini-PC local | |
| Testes | Vitest (unit/integração) + Playwright (e2e) | |
| Monorepo | pnpm workspaces + Turborepo | Igual ao QR MESAS |

**Regra de ouro:** o cliente final (quem come) usa SEMPRE o browser. Zero instalação.

---

## 3. Estrutura do repositório

```
/apps/web                       # Next.js: loja do cliente + painel admin
  /app/(public)/                # loja: cardápio, carrinho, checkout, status do pedido (anon)
    page.tsx                    #   storefront (cardápio + carrinho)
    checkout/                   #   dados, levantamento/entrega+zona, agendamento, pagamento manual/auto
    order-status/[orderId]/     #   acompanhamento do pedido (polling)
  /app/(admin)/                 # painel interno (auth Supabase)
    pedidos/  caixa/  analise/  feedback/  lista-espera/
  /app/api/webhooks/paysuite/   # webhook de pagamento (HMAC + idempotência)
  /app/api/payments/            # cria checkout Paysuite
  /app/api/emails/              # envio transacional (Resend)
  /app/api/cron/reconcile/      # reconciliação Paysuite (5 min)
/config/brand.ts                # ⭐ identidade whitelabel (nome, cores, logo, locale, redes)
/packages/core                  # PORTADO do QR MESAS: money, order-machine, schemas (sem planos)
/packages/db                    # migrations SQL single-tenant + seed + tipos gerados
/packages/paysuite              # PORTADO do QR MESAS: provider + mock + paysuite real
/services/print-bridge          # PORTADO do QR MESAS: poll print_jobs → ESC/POS TCP (single-tenant)
/docs/decisions                 # ADRs
ROADMAP.md                      # fases de execução com DoD
```

---

## 4. Arquitetura single-tenant

**Princípio:** uma instância = um restaurante = um banco. Sem `tenant_id` em lado nenhum.

### Regras
1. RLS habilitado em TODAS as tabelas. `authenticated` = staff do restaurante (lê/gere tudo). `anon` = NENHUMA policy direta.
2. Todo acesso público (loja do cliente) passa por **RPCs `SECURITY DEFINER`** (`get_menu`, `create_order`, `get_order_status`). O client anon nunca faz SELECT direto.
3. Preços e taxas de entrega são SEMPRE recalculados no servidor a partir da BD. O payload do cliente só traz nomes, quantidades, zona e horário.
4. Rotas públicas: `/` (loja), `/checkout`, `/order-status/{orderId}`. Painel (tabs em `(admin)/layout.tsx`): `/pedidos`, `/caixa`, `/analise`, `/feedback`, `/lista-espera`, `/cardapio` (cardápio + zonas de entrega), `/marketing`, `/definicoes` (settings operacionais), `/layout-loja` (formatos visuais da loja + imagens de hero/banners — F10).
5. **"Venda confirmada" (decisão fechada):** `status in ('approved','paid','in_preparation','ready','delivered')`. É este o conjunto que conta para faturado/ativos (`get_order_stats`), métricas de Análise (`get_dashboard_metrics`) e caixa (`get_cash_dashboard`). No fluxo manual a venda é real assim que o dono APROVA, não só quando entrega. Métricas específicas de entrega (tempo médio, nº entregues) continuam restritas a `delivered`. A caixa conta desde o último fecho (não desde a meia-noite).

### Schema de referência (migrar em fases — ver ROADMAP)

```
settings            (id smallint pk default 1 check (id=1)  -- singleton
                     mpesa_number, mpesa_name, emola_number, emola_name,
                     pickup_address, pickup_maps_url, owner_email,
                     open_hour int, close_hour int, slot_minutes int default 30,
                     accepting_orders bool default true,  -- "pré-launch"/loja fechada
                     payment_provider text check in ('manual','mock','paysuite') default 'manual',
                     -- Layout da Loja (F10) — campos PÚBLICOS (devolvidos por get_menu()):
                     storefront_layout smallint default 1 check (storefront_layout in (1,2,3)),
                     hero_image_url    text null,          -- hero uploadado; null = usa brand.ts
                     banner_images     jsonb default '[]') -- [{url,title,sort}] até 5 mini banners (Formato 2)
menu_categories     (id uuid pk, name, sort int, station text check in ('kitchen','bar','cold_kitchen') default 'kitchen', active bool default true)
menu_items          (id uuid pk, category_id, name, description, price_cents int check (>=0),
                     photo_url, available bool default true,
                     track_stock bool default false, stock_qty int check (>=0), sort int)
delivery_zones      (id uuid pk, name, fee_cents int check (>=0), active bool default true, sort int)
orders              (id uuid pk, order_number text unique,         -- "ENC-0042"
                     status text, flow text check in ('digital','manual'),
                     fulfillment_type text check in ('pickup','delivery'),
                     delivery_zone_id uuid null, address text null,   -- obrigatório se delivery
                     customer_name, customer_phone,
                     scheduled_for timestamptz null,                  -- null = AGORA (ASAP)
                     subtotal_cents int, delivery_fee_cents int, total_cents int,
                     payment_method text check in ('mpesa','emola','credit_card','cash'),
                     payment_proof_path text null,                    -- comprovativo (fluxo manual)
                     notes text, created_at, updated_at)
order_items         (id uuid pk, order_id, menu_item_id, name_snapshot text, qty int check (>0),
                     unit_price_cents int, station text, notes text)
payments            (id uuid pk, order_id, provider, provider_ref, method, amount_cents int,
                     status text check in ('pending','confirmed','failed','refunded'),
                     idempotency_key text unique, raw_webhook jsonb, created_at)
print_jobs          (id uuid pk, order_id, station, payload jsonb,
                     status text check in ('queued','printing','printed','failed'),
                     attempts int default 0, created_at, printed_at)
cash_sessions       (id uuid pk, opened_at/by, closed_at/by, expected_cash_cents, counted_cash_cents,
                     difference_cents, notes, report jsonb)
order_feedback      (id uuid pk, order_id null, rating int, comment text, created_at)
waitlist            (id uuid pk, name, phone, created_at)
event_log           (id bigserial pk, order_id null, type text, payload jsonb, created_at)  -- append-only
device_heartbeats   (id text pk, kind text, last_seen_at)            -- printer/admin online
```

Notas:
- `order_items.name_snapshot` + `unit_price_cents`: snapshot no momento do pedido (cardápio muda, histórico não).
- `event_log` append-only (sem UPDATE/DELETE policies).
- Identidade da marca (nome/cores/logo) vive em `config/brand.ts`, **não** na BD. `settings` é só config operacional editável pelo dono.

---

## 5. Máquina de estados do pedido (fonte única: `packages/core/src/order-machine.ts` — PORTADA do QR MESAS, intacta)

```
Fluxo manual (pagamento M-Pesa/e-Mola por comprovativo, ou dinheiro na entrega):
draft → awaiting_approval → approved → in_preparation → ready → delivered

Fluxo digital (Paysuite):
draft → awaiting_payment → paid → in_preparation → ready → delivered
                        ↘ payment_failed → awaiting_payment (retry)

Qualquer estado não-terminal → cancelled (só staff, com motivo, logado em event_log)
```

- **O pedido só vira "novo" para a cozinha/impressora quando `paid` (digital) ou `approved` (manual).**
- O **comprovativo** do fluxo manual NÃO confirma sozinho: o dono vê o comprovativo no painel e clica **Aprovar** (`APPROVE`) ou **Negar** (`CANCEL` com motivo). É aí que o cliente recebe o email de confirmação/recusa.
- Transições só via RPC `advance_order(p_order_id, p_event, p_reason)` que chama a state machine. Update direto de `status` pelo client = proibido (bloqueado por RLS). `CANCEL` exige `p_reason`.
- Toda transição grava `event_log`.

---

## 6. Pagamentos

### 6.1 Manual (default, cobre 100% dos clientes)
1. Cliente finaliza o pedido escolhendo **M-Pesa** ou **e-Mola**.
2. Pedido nasce `awaiting_approval` (flow `manual`).
3. Ecrã mostra o **número e nome** do `settings` (ex.: M-Pesa 84… / Soeil Nissar) + instrução: *"Transfere e envia o comprovativo"*.
4. Cliente faz **upload do comprovativo** → bucket **privado** `payment-proofs`; caminho guardado em `orders.payment_proof_path`.
5. **Email ao dono** ("Novo pedido #ENC-0042 com comprovativo"). Pedido aparece no painel **Pedidos** com botão "Ver comprovativo" (signed URL).
6. Dono **Aprova** → `approved` → cozinha/impressora + **email ao cliente** ("pagamento confirmado"). Ou **Nega** → `cancelled` + **email ao cliente** ("pagamento não confirmado").

### 6.2 Automático (Paysuite) — `packages/paysuite` PORTADO do QR MESAS · **EM PRODUÇÃO (validado com M-Pesa real)**
- Base da API: `https://paysuite.tech/api/v1`. Cliente clica "Pagar Agora" → servidor cria checkout (`POST /payments`) → redireciona para `checkout_url`.
- **Config das chaves:** vêm de `settings` (admin → Definições → Paysuite: `paysuite_api_key`, `paysuite_webhook_secret`, migration `0019`) **com fallback** para env (`PAYSUITE_API_KEY`/`PAYSUITE_WEBHOOK_SECRET`). Resolvido em `apps/web/lib/payments/config.ts` (`getPaymentConfig`/`buildProvider`). NÃO há encriptação por-tenant.
- **Confirmação do pagamento — 3 caminhos idempotentes** (idempotency key = `orderToReference(orderId)` em todos):
  1. **Webhook** `/api/webhooks/paysuite` (HMAC-SHA256 do raw body) — fonte de verdade, instantâneo.
  2. **Verificação ATIVA** `/api/payments/verify` — chamada pela página `/payment/return`; pergunta o estado direto ao Paysuite (`getPaymentStatus`) e confirma. **Não depende do webhook** (evita o pedido ficar preso em "A processar" quando o webhook não chega / cron não corre).
  3. **Cron** `/api/cron/reconcile` (5 min) — rede de segurança (não corre sozinho no Railway).
- **GOTCHAS REAIS (corrigidos):** `reference` tem de ser **alfanumérico** (`apps/web/lib/payments/reference.ts`, `ord`+hex32) — `order_<uuid>` dá HTTP 422; `return_url`/`callback_url` precisam de **esquema** (`resolvePublicBase` na rota de payments); transação paga = `transaction.status='completed'` (mapeado em `API_STATUS_MAP`).
- Runbook completo para ligar a um cliente novo: skill **`/connect-paysuite`** (`.claude/skills/`).

### 6.3 Conversão centavos ↔ decimal (`packages/core/src/money.ts`, PORTADO)
Interno: `Cents` inteiro. Boundary Paysuite: `centsToDecimalString` / `decimalStringToCents`. Nunca float para dinheiro.

### 6.4 `confirm_payment` (RPC transacional)
Valor do webhook ≠ `orders.total_cents` → NÃO confirma; loga `payment.amount_mismatch`; fica `pending` para reconciliação; 200. Pedido fora de `awaiting_payment`/`payment_failed` → confirma o pagamento mas não transiciona; loga `payment.confirmed_on_invalid_state`; 200.

---

## 7. Entrega, levantamento e agendamento

- **Levantamento (pickup):** sem morada; mostra `pickup_address` + link de mapa do `settings`. Taxa = 0.
- **Entrega (delivery):** cliente escolhe uma **zona** (`delivery_zones`) → `delivery_fee_cents` somado ao total no servidor; **morada obrigatória**. (Por zonas — decisão fechada.)
- **Agendamento:**
  - **Agora (ASAP):** `scheduled_for = null` → pode preparar/imprimir já.
  - **Horário:** slots de `slot_minutes` (default 30) **do próprio dia**, dentro de `open_hour`–`close_hour`, sempre no futuro. O servidor valida o slot (não confiar no client).
- O **painel Pedidos** tem vista **Lista** e **Calendário** (como nas screenshots): agrupa por dia, mostra "começar preparo às HH:MM", totais por produto do dia.

---

## 8. Painel interno (reskin **estilo iFood** — vermelho `#EA1D2C`, ver screenshots do dono)

> **Estado:** o painel admin foi reestilizado ao estilo iFood (2026-06-16). `apps/web/app/(admin)/layout.tsx` =
> sidebar vertical + topbar + drawer mobile (tema vermelho). `pedidos/page.tsx` = 6 KPIs (`get_order_stats`
> estendido na migration `0021`: faturado/pedidos hoje, em preparo, prontos, cancelados, avaliação média),
> abas de status, tabela (desktop) + cards (mobile). Falta estender o reskin às outras tabs.
> Dinheiro no painel: usar `formatMT` (centavos → `MT`), **nunca** `Intl ... currency MZN` (dá `MTn`).

Tabs: **Pedidos · Caixa · Análise · Feedback · Lista de Espera**. Auth Supabase (single-tenant → `authenticated` = staff).

- **Pedidos:** cards de stat no topo (Total Faturado, Ativos, Aguarda Pagamento, Em Preparo, Prontos), busca, vista Lista/Calendário, filtros (Ativos/Aguarda pagamento/Pagos/Em preparo/Prontos/Concluídos/Cancelados/Todos). Aprovar/Negar, ver comprovativo, avançar estado.
- **ADD PRODUTOS (dentro de Pedidos ou aba própria de gestão):** CRUD de categorias e itens — nome, descrição, **preço (MT → centavos)**, foto (Storage), `available`, e os campos de **estoque** (`track_stock`, `stock_qty`) já prontos para ligar. Reaproveitar padrão de `apps/web/app/(staff)/admin/menu-section.tsx` do QR MESAS.
- **Caixa:** fecho de caixa por dia (total pedidos, faturado, entregues, por fechar, vendido por unidade), notas, **PDF** e **email** do fecho. Reaproveitar `cash_sessions` (F2.9 do QR MESAS).
- **Análise:** faturação (dia/semana/mês), ticket médio, produtos mais vendidos, **Como recebem** (Levantamento vs Entrega), horários de pico (heatmap), clientes que mais compraram. Reaproveitar `dashboard-section.tsx` + views (`0010_dashboard_views.sql`) do QR MESAS, adaptadas single-tenant.
- **Feedback / Lista de Espera:** `order_feedback` e `waitlist` (INSERT anon com rate-limit ao nível do DB).

---

## 9. Impressora térmica (opcional, 24/7) — `services/print-bridge` PORTADO do QR MESAS

- Node leve a correr num mini-PC/PC local do restaurante, ligado 24/7. `.env`: `SUPABASE_URL`, service key restrita, `PRINTER_IP`.
- Poll de `print_jobs.queued` (3s) → render ESC/POS → TCP `ip:9100` → marca `printed`. Retry 3× com backoff → `failed` + `event_log`.
- 1 `print_job` é criado quando o pedido fica `paid`/`approved` (na mesma transação de `confirm_payment`/`advance_order APPROVE`).
- Cupom: nº pedido, **nome do cliente em destaque**, itens+qty+notas, **Levantamento/Entrega + zona + morada**, **horário (Agora ou HH:MM)**, "PAGO VIA M-PESA"/"AGUARDA PAGAMENTO NA ENTREGA", hora.
- `printer-sim` (simulador TCP) para `pnpm bridge:dev` sem hardware. **A impressora é redundância; o painel é o canal primário.** Falha de impressão NUNCA esconde o pedido.

---

## 10. Comandos

```bash
pnpm dev            # web em localhost:3000
pnpm test           # vitest run (CI/DoD)
pnpm test:watch     # vitest watch
pnpm test:e2e       # playwright
pnpm lint           # eslint + tsc --noEmit por package
pnpm db:migrate     # supabase db reset (aplica migrations + seed)
pnpm db:types       # regenera tipos do schema
pnpm bridge:dev     # print-bridge com impressora simulada
```

---

## 11. Variáveis de ambiente (`.env.example`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # só servidor
PAYMENT_PROVIDER=manual|mock|paysuite
PAYSUITE_API_KEY=                 # só se paysuite
PAYSUITE_WEBHOOK_SECRET=          # só se paysuite
RESEND_API_KEY=                   # email transacional (ou SMTP_* se preferires)
OWNER_EMAIL=                      # para onde vão os avisos de novo pedido
APP_BASE_URL=
# print-bridge (no mini-PC local):
PRINTER_IP=
```

---

## 12. O que NUNCA fazer

- ❌ Float para dinheiro. Sempre centavos inteiros.
- ❌ Adicionar `tenant_id`, `qr_token` ou planos comerciais. Isto é single-tenant.
- ❌ `anon` com SELECT direto em tabela (sempre RPC `SECURITY DEFINER`).
- ❌ Confiar no client para preços, taxa de entrega, estado de pagamento ou validade de horário.
- ❌ Mostrar pedido na cozinha/impressora antes de `paid`/`approved`.
- ❌ Webhook sem assinatura verificada e sem idempotência.
- ❌ URL pública do bucket `payment-proofs` (é privado, dá 400) — usar `createSignedUrl`.
- ❌ Acoplar o sistema à impressora (papel = redundância).
- ❌ Editar a identidade da marca espalhada pelo código — só em `config/brand.ts`.
- ❌ Pular fase do ROADMAP ou alterar contrato de fase concluída sem ADR.
- ❌ Confiar no client para desconto, cupom, brinde ou meta de gamificação — sempre recalcular no `create_order`.
- ❌ ID de pixel/GA/Ads hardcoded; carregar tags de marketing sem consentimento (`dl_consent`).
- ❌ Disparar `purchase` antes de `paid`/`approved`.
- ❌ Devolver PII (morada, comprovativo, pagamento) de um telefone na personalização soft (sem OTP).
- ❌ Permitir item `is_gift` no pedido sem cupom válido, ou mais de 1 unidade de brinde.

---

## 13. Reaproveitamento do QR MESAS (copiar, depois simplificar)

Fonte: `C:\Users\Gabriel\Desktop\QR MESAS`. Visual: `C:\Users\Gabriel\Desktop\HawSmash\admin.css`.

| Trazer para cá | De | O que mudar |
|---|---|---|
| `money.ts` | `packages/core/src/money.ts` | Nada (usar tal e qual) |
| `order-machine.ts` | `packages/core/src/order-machine.ts` | Nada — já tem flows `digital` + `manual` |
| `schemas.ts` (Zod) | `packages/core/src/schemas.ts` | Adaptar payloads (entrega/zona/agendamento; sem qr_token) |
| `plans.ts` | `packages/core/src/plans.ts` | **NÃO trazer** (não há planos) |
| Paysuite (provider/mock/real/errors) | `packages/paysuite/src/*` | Nada na lógica; chaves via env (sem por-tenant) |
| print-bridge | `services/print-bridge/src/*` | Remover `TENANT_ID`; cupom de delivery (nome/zona/morada/horário) |
| Admin sections | `apps/web/app/(staff)/admin/*-section.tsx` | Reskin HawSmash; remover gating por plano; rotas pickup/delivery |
| Cash session | migration `0011`/cash + `cash-section` | Single-tenant; PDF + email do fecho |
| Dashboard views | `packages/db/migrations/0010_dashboard_views.sql` | Tirar `tenant_id`; adicionar split pickup/delivery |

**Tema visual (HawSmash):** CSS vars `--gold (#e5a93c)`, `--ink`, `--ink-mute`, `--line-strong`, fundo escuro `#0a0807→#110d0a`, `--font-display`/`--font-body`. Mapear para tokens do Tailwind em `config/brand.ts` para serem por-cliente.

---

## 14. PADRÕES CANÓNICOS (copiar, não reinventar)

### 14.1 RLS single-tenant
```sql
alter table menu_items enable row level security;
-- staff (qualquer authenticated, pois 1 restaurante) gere tudo:
create policy "staff_all" on menu_items for all to authenticated using (true) with check (true);
-- anon: NENHUMA policy. Acesso público só via RPC 14.2.
```

### 14.2 Acesso público via RPC SECURITY DEFINER (sem qr_token)
```sql
create or replace function public.get_menu()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'accepting_orders', (select accepting_orders from settings where id = 1),
    'categories', (select coalesce(jsonb_agg(... order by c.sort), '[]'::jsonb)
                   from menu_categories c where c.active /* + itens available */),
    'zones', (select coalesce(jsonb_agg(...), '[]') from delivery_zones where active));
end; $$;
grant execute on function public.get_menu() to anon;
```
Mesmo padrão para `create_order(p_payload jsonb)` e `get_order_status(p_order_id uuid)`.

### 14.3 Idempotência de webhook (igual ao QR MESAS)
```ts
const raw = await req.text();
if (!verifySignature(raw, headers, env.PAYSUITE_WEBHOOK_SECRET)) return new Response('invalid', { status: 401 });
const evt = paysuiteWebhookSchema.parse(JSON.parse(raw));
// INSERT ... ON CONFLICT (idempotency_key) DO NOTHING → 0 rows = duplicado → 200
const inserted = await confirmPayment(evt);
if (!inserted) return Response.json({ ok: true, duplicate: true });
await Promise.all([createPrintJob(evt.orderId), logEvent('payment.confirmed', evt)]);
return Response.json({ ok: true });
```

### 14.4 Estoque atómico (quando `track_stock`)
```sql
-- na MESMA transação que confirma/aprova o pedido:
update menu_items set stock_qty = stock_qty - v_qty
where id = v_item_id and track_stock and stock_qty >= v_qty;
-- row_count = 0 → raise 'out_of_stock:<id>' → rollback do pedido inteiro
```

### 14.5 Dinheiro
`packages/core/src/money.ts` é o único lugar que formata/calcula dinheiro (`Cents`, `formatMT`, `orderTotal`, `centsToDecimalString`, `decimalStringToCents`).

---

## 15. Onboarding de um cliente novo (o "turnkey")

1. Clonar o repo para uma pasta/serviço novo.
2. Editar `config/brand.ts` (nome, cores, logo, redes) e colocar assets em `/public/assets`.
3. Preencher `.env` (Supabase do cliente, provider de pagamento, Resend, OWNER_EMAIL).
4. `pnpm db:migrate` no Supabase do cliente; `pnpm db:seed` (categorias/itens/zonas exemplo).
5. No admin: ajustar `settings` (números M-Pesa/e-Mola, horários, morada), cardápio e zonas.
6. Deploy (Vercel). Opcional: instalar o `print-bridge` no mini-PC do restaurante.
7. **"Conectar o front" = passos 2–3.** A partir daí o sistema sabe receber pedidos.

---

## 16. Marketing & Tracking (FASE 4) — spec COMPLETA

> Objetivo: medir o funil inteiro (entrada → cardápio → carrinho → checkout → compra) em **GTM + GA4 + Meta Pixel +
> Google Ads**, com eventos first-party próprios (fonte de verdade), e proteger a atribuição contra iOS/adblock com
> **Meta CAPI** e **Google Enhanced Conversions** server-side. Trazer os KPIs para o painel **Análise**.
> Single-tenant: a config vive em `settings` (singleton id=1), editável no admin — **nunca** `tenants`, **nunca** hardcoded.

### 16.1 A regra crítica (escrita em código antes de tudo)
- **`purchase` NUNCA dispara no submit do checkout.** Dispara **APENAS** em `/order-status` quando `order.status ∈ {paid, approved}`.
- **Idempotência dupla:** guard in-memory (`useRef`) **+** guard persistente (`localStorage['tracked_purchase_<orderId>']`) → não re-dispara em reload.
- `value` em **MT decimal** sempre via `money.ts` (`total_cents / 100` encapsulado), nunca float manual.
- `eventID = 'purchase_<orderId>'` em TODOS os destinos → deduplicação browser↔server (CAPI/Enhanced Conversions).
- `transaction_id = order.id` em GA4 e Ads → dedup nativo deles em reload.

### 16.2 Config por instância (tudo no admin — "cole e está configurado")
> Princípio: o dono configura **tudo** na tab **Marketing**, sem tocar em `.env`. Mas há duas classes de campo,
> com regras de exposição diferentes. **NUNCA** misturar as duas no mesmo SELECT público.

Migration aditiva (`0014_tracking.sql`), colunas em `settings` (singleton — **sem** `tenant_id`):
```sql
-- (A) IDs PÚBLICOS — vão para o client (carregam os scripts). OK no get_menu().
alter table settings add column gtm_container_id      text;  -- 'GTM-XXXXXX'
alter table settings add column meta_pixel_id         text;  -- '123456789'
alter table settings add column ga4_measurement_id    text;  -- 'G-XXXXXXXXXX'
alter table settings add column gads_conversion_id    text;  -- 'AW-123456789'
alter table settings add column gads_conversion_label text;  -- 'AbCdEfGhIjK'
-- (B) SEGREDOS — só servidor. NUNCA no get_menu() nem em qualquer RPC anon.
alter table settings add column meta_capi_token       text;  -- token CAPI (server-side)
alter table settings add column gads_developer_token  text;  -- Google Ads dev token (server-side)
-- (e, conforme a F5/F2, podem entrar aqui no mesmo padrão: resend_api_key, paysuite_api_key, paysuite_webhook_secret)
```
- **`get_menu()` devolve SÓ os campos (A).** Os campos (B) **nunca** entram num RPC com `grant … to anon`. O servidor lê (B) com service role (ex.: em `confirm_payment`/handlers de CAPI), ou via RPC `get_secret_settings()` restrita a `authenticated`.
- **Precedência:** valor em `settings` (B) tem prioridade; se vazio, cai no `.env` (`META_CAPI_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`) como fallback. Assim funciona tanto "tudo no admin" como "tudo no `.env`".
- **RLS:** os campos (B) ficam na mesma linha `settings`, mas `settings` já é `staff_all` (só `authenticated`). O perigo é o `get_menu()` (SECURITY DEFINER) vazar — por isso o SELECT dele lista colunas explicitamente, nunca `select *`.
- Admin → tab **Marketing** (owner only): inputs para cada ID/token com link de "onde encontrar", campos de token mascarados (mostra `••••1234`, "Substituir" para trocar), **botão "Testar ligação"** (valida CAPI/Ads sem expor o token), e **preview do `dataLayer`**.

### 16.3 Módulo canónico de tracking (`apps/web/lib/analytics/track.ts`)
Único lugar que toca `dataLayer`/`fbq`/`gtag`. Componentes **nunca** chamam direto. Expõe:
- `loadGTM(containerId)` — injeta o GTM no `<head>` uma vez (guard por `id` do script). GTM é o hub: lê o `dataLayer` e reenvia a GA4/Meta/Ads via tags configuradas no painel GTM.
- `trackViewMenu(items)` · `trackViewItem(item)` · `trackAddToCart(item)` · `trackBeginCheckout(cart)` · `trackAddPaymentInfo()` · `trackPurchase(order)` · `trackLead()` · `trackCouponApplied(code)`.
- **Ordem do push no `purchase`** (fixa): (1) `dataLayer.push({ ecommerce: null })` para limpar contexto anterior; (2) push GA4 `ecommerce`; (3) push Google Ads `conversion` (`send_to: '<AW-ID>/<LABEL>'`); (4) `fbq('track','Purchase', …, { eventID })` se `fbq` existir.
- **GA4 `items[]`** preenchido por linha: `{ item_id: menu_item_id, item_name, price, quantity }` (sem isto o relatório de e-commerce não atribui).
- **Meta** sempre com `eventID`, `content_ids`, `content_type: 'product'`, e `contents: [{ id, quantity }]` por item (Advantage+ Catalog/retargeting).

### 16.4 Onde cada evento dispara
| Evento | Ficheiro / gatilho | Condição |
|---|---|---|
| `view_menu` | storefront `/` → mount com menu carregado | sempre |
| `view_item` | abrir detalhe/abrir item | sempre |
| `add_to_cart` | `useCart` ADD | sempre |
| `begin_checkout` | entrar em `/checkout` | sempre |
| `add_payment_info` | escolher M-Pesa/e-Mola/auto | sempre |
| `purchase` | `/order-status/[orderId]` | **APENAS `paid`/`approved`** (16.1) |
| `lead` | waitlist submit | loja fechada |
| `coupon_applied` | aplicar referral (17) | código válido |

### 16.5 `order_items` no order-status (para `items[]`/`contents[]`)
O `get_order_status` passa a devolver também `order_items(menu_item_id, name_snapshot, qty, unit_price_cents)`, para preencher GA4 `items[]` e Meta `contents[]` com detalhe por produto. Sem isto, cai no fallback `item_id = order.id` / `num_items: 1`.

### 16.6 Eventos first-party (fonte de verdade interna)
- Tabela `analytics_events` (ver 19). Client faz `POST /api/track` (Zod + `session_id` cookie 1st-party + `customer_phone` se identificado em 18.2). Server insere via service role — **anon nunca faz INSERT direto**.
- Sobrevivem a adblock/iOS → alimentam o funil do painel **Análise**. Pixels são para os ad networks; estes são a verdade.

### 16.7 Cookies & consentimento
- Banner PT (cookie `dl_consent`). Sem consentimento → só `session_id` 1st-party + first-party events; **GTM/Pixel/Ads só carregam após "Aceitar"**.

### 16.8 Server-Side: Meta CAPI + Google Enhanced Conversions (anti iOS/adblock)
- **Meta CAPI:** na MESMA transação/handler que confirma o pedido — `confirm_payment` (digital → `paid`) **e** `advance_order APPROVE` (manual → `approved`) — disparar (fire-and-forget, **nunca** bloqueia o pedido) um POST à Conversions API com `event_id: 'purchase_<orderId>'` (o mesmo do browser → Meta deduplica). Token lido de `settings.meta_capi_token` (B) ou fallback `.env META_CAPI_TOKEN`.
- **Google Enhanced/Offline Conversions:** no webhook Paysuite / na confirmação, enviar a conversão com `transaction_id = order.id`. Token de `settings.gads_developer_token` (B) ou fallback `.env GOOGLE_ADS_DEVELOPER_TOKEN`.
- Regra: falha de envio server-side **nunca** afeta o estado do pedido (log em `event_log`, segue a vida).

### 16.9 KPIs no painel Análise
Aba **Análise** (Recharts existente): funil com taxas de conversão por etapa (entrada→carrinho→checkout→compra), origem (`utm_source/medium` gravados no `analytics_events`), ROAS aproximado se Ads ligado. Tudo derivado de `analytics_events` via view SQL (sem `tenant_id`).

---

## 17. Indique e Ganhe + Presente/Cupom (FASE 5)

> Cada pessoa tem um **código** para partilhar. Um amigo coloca o código no fim do pedido → ganha **desconto** ou **item grátis**.
> Quem emitiu **não pode resgatar o próprio código** e cada código vale **um resgate** (configurável). Tudo validado no servidor.

### 17.1 Regras (decisões fechadas)
- O **benefício é do redentor** (quem usa o código): `discount` (centavos ou %) **ou** `free_item` (um item específico a preço 0).
- O **emissor** acumula crédito opcional (`referral_codes.referrer_reward_cents`) — MVP pode deixar como log; ativar depois.
- **Anti-abuso (validado SÓ no servidor, no `create_order`):**
  - `owner_phone == customer_phone` → rejeita (auto-resgate).
  - código já resgatado (`referral_redemptions` atingiu `max_redemptions`, default 1) → rejeita.
  - mesmo `customer_phone` já resgatou esse código → rejeita.
  - código inativo/expirado → rejeita.
- **Item grátis:** marcado por `menu_items.is_gift = true` (categoria "SEU PRESENTE", `available=false` por padrão). Só entra no pedido a preço 0 **se** um cupom válido o liberar, e **no máximo 1 unidade**. Sem cupom, o servidor remove/recusa qualquer item `is_gift`.
- O desconto/preço final é **recalculado no servidor**. O client só mostra *preview* (o "muda os preços do site" é cosmético até o `create_order` confirmar).

### 17.2 Fluxo
1. Front tem barra abaixo da hero: **"Coloque aqui o código do seu amigo"**. Ao aplicar → chama RPC `validate_referral(p_code, p_phone)` (read-only, SECURITY DEFINER) que devolve `{ valid, reward_type, reward_value, gift_item }` **sem** confiar nisso para o preço final.
2. Se válido: UI libera a categoria **SEU PRESENTE** (1 item grátis) e/ou mostra desconto previsto.
3. No checkout, o `p_payload` carrega `referral_code`. O `create_order` revalida tudo, aplica o benefício, grava `referral_redemptions`, e loga `referral.redeemed` em `event_log`.
- Geração de códigos: cada `customer` (18) recebe um código estável ao identificar-se; admin pode criar campanhas manuais.

---

## 18. Entrada personalizada + Gamificação (FASE 6)

### 18.1 Página de entrada (gate, não-scrollável)
- Antes da hero, uma tela cheia com imagem do restaurante (de `brand.ts`) + 1 campo: **telefone**. Sem scroll. CTA "Entrar".
- Ao submeter → `identify_customer(p_phone, p_name?)` (RPC SECURITY DEFINER): upsert em `customers`, devolve histórico leve (favoritos derivados, últimas compras resumidas). Seta cookie `dl_phone` (1st-party) e liga o `phone` aos `analytics_events`.
- **Risco de privacidade (anotar no código com `// DECISÃO:`):** sem OTP, isto é "soft login" — quem souber o número vê o histórico daquele número. Por isso a RPC devolve **só** itens/resumos, **nunca** morada, comprovativo ou dados de pagamento. Se o cliente quiser OTP no futuro → ADR.
- Personalização: itens favoritos (mais pedidos por aquele telefone) com ❤️, "Pedir de novo" das últimas compras. Pode-se pular o gate (link "ver cardápio") — não bloquear a venda.

### 18.2 Modo "energizado" (gamificação)
- À medida que o carrinho cresce (subtotal), o site/`botão Finalizar` ganham brilho progressivo (CSS via `--gold`, sem libs pesadas; estado derivado do subtotal, **não** persiste preço).
- **Meta de brinde:** `settings.gift_goal_cents` (ex.: 250000 = 2500 MT) e `settings.gift_goal_item_id`. Ao bater a meta no subtotal, o servidor (no `create_order`) adiciona o item-prémio a 0 — **validado no servidor**, não no client. Barra de progresso "Faltam X MT para o seu brinde 🎁".
- Tudo cosmético no client; **o brinde só é real quando o `create_order` o concede** (mesma disciplina do cupom).

---

## 19. Schema novo das FASES 4–6 (migrar em fases — aditivo, RLS 14.1)

```
analytics_events    (id bigserial pk, session_id text, customer_phone text null,
                     type text, value_cents int null, utm jsonb, payload jsonb, created_at)
                     -- append-only; INSERT só via /api/track (service role); ler só authenticated
customers           (phone text pk, name text, first_seen_at, last_seen_at,
                     orders_count int default 0, total_spent_cents int default 0)
                     -- identificação soft (sem OTP); leitura pública só via RPC do próprio telefone
referral_codes      (id uuid pk, code text unique, owner_phone text null, owner_name text,
                     reward_type text check in ('discount_cents','discount_pct','free_item'),
                     reward_value int,                 -- centavos, % ou ignorado se free_item
                     gift_item_id uuid null,           -- se free_item
                     referrer_reward_cents int default 0,
                     max_redemptions int default 1, active bool default true,
                     expires_at timestamptz null, created_at)
referral_redemptions(id uuid pk, code_id uuid, order_id uuid, customer_phone text, created_at,
                     unique(code_id, customer_phone))  -- 1 resgate por cliente por código
```
Aditivos a tabelas existentes:
- `menu_items.is_gift bool default false`
- `settings.gift_goal_cents int null`, `settings.gift_goal_item_id uuid null`
- `orders.referral_code text null`, `orders.discount_cents int default 0`, `orders.gift_item_id uuid null`
  (total no servidor = `subtotal - discount + delivery_fee`)

**Nunca:** confiar no client para desconto, brinde ou validade de cupom; expor pixels com ID hardcoded; carregar marketing sem consentimento; devolver PII de outro telefone na personalização.
</content>
</invoke>
