# CLAUDE.md — Mesa QR (QR Restaurant OS) — v2

> SaaS multi-tenant de pedidos na mesa via QR Code para restaurantes em Moçambique.
> Cliente escaneia QR → cardápio → pede → paga (M-Pesa/e-Mola via Paysuite) → pedido cai em tempo real na cozinha/bar → garçom só entrega.

---

## ⚡ COMO TRABALHAR NESTE REPO (regras para o agente de IA)

Estas regras existem para que qualquer modelo — mesmo em modo de baixo esforço — produza código correto:

1. **Trabalhe SEMPRE em uma única fase do `ROADMAP.md` por sessão.** Nunca antecipe fases futuras.
2. **Antes de codar:** leia este arquivo inteiro + a fase atual no ROADMAP. Liste os arquivos que vai criar/alterar e espere confirmação se houver dúvida de escopo.
3. **Skeleton-first:** crie primeiro tipos, contratos, schemas e assinaturas de funções. Depois testes. Depois implementação. (Método Akita.)
4. **Tests-before-code:** nenhuma lógica de domínio sem teste Vitest escrito ANTES.
5. **NÃO altere contratos de fases concluídas** (schemas SQL já migrados, tipos exportados de `/packages/core`, rotas públicas). Se precisar mudar, pare e proponha um ADR em `/docs/decisions/`.
6. **Copie os padrões canônicos da seção 13** em vez de inventar variações (RLS, idempotência, estoque atômico, dinheiro).
7. **Definition of Done de toda fase:** `pnpm lint && pnpm test` verdes + checklist da fase no ROADMAP marcado + commit convencional (`feat(scope): ...`).
8. Em caso de ambiguidade: escolha a opção mais simples que respeite a seção 12 ("O que NUNCA fazer") e documente a escolha num comentário `// DECISÃO:`.

---

## 1. Visão do produto e planos comerciais

- **Modelo:** SaaS B2B, assinatura mensal em **MZN (MT)**. Mercado: Maputo → Moçambique. UI em **português**.
- **Posicionamento:** Smart Restaurant System — reduz equipe, elimina erros de pedido, aumenta ticket médio, centraliza operação. NÃO é "site de restaurante".
- **Diferencial competitivo:** integração nativa M-Pesa/e-Mola + operação confiável com internet instável + suporte local. (Concorrentes globais não atendem Moçambique.)

### 1.1 Planos (gating de features — fonte única: `packages/core/src/plans.ts`)

| Feature | Starter (MT 1.500) | Pro (MT 2.500) | Premium (MT 4.500) |
|---|---|---|---|
| QR nas mesas + cardápio digital | ✅ | ✅ | ✅ |
| Pedido na mesa (sem pagamento online) | ✅ | ✅ | ✅ |
| Resumo do pedido via WhatsApp | ✅ | ✅ | ✅ |
| Pagamento M-Pesa/e-Mola (Paysuite) | ❌ | ✅ | ✅ |
| Impressão automática (print-bridge) | ❌ | ✅ | ✅ |
| Gestão de estoque | ❌ | ❌ | ✅ |
| Dashboard + relatórios | ❌ | ❌ | ✅ |
| Programa de fidelidade | ❌ | ❌ | ✅ |

- **Piloto = Plano Pro.**
- Gating SEMPRE verificado no servidor (RPC/route handler), nunca só na UI.

## 2. Stack (decisões fechadas — não mudar sem ADR)

| Camada | Tecnologia | Motivo |
|---|---|---|
| Frontend | Next.js 14+ (App Router) + TypeScript | Web cliente + PWA cozinha/admin num só código |
| UI | Tailwind CSS + shadcn/ui | Velocidade, consistência |
| Estado servidor no client | TanStack Query | Cache, retry, reconexão |
| Backend/DB | Supabase (Postgres + RLS + Realtime + Auth + Storage) | Multi-tenancy via RLS, realtime para cozinha |
| Validação | Zod em toda boundary | Inputs nunca confiáveis |
| Pagamentos | Paysuite (M-Pesa, e-Mola; 6.48%) | API pública, operando, melhor doc |
| Hosting | Vercel + Supabase Cloud | Stack já dominado |
| Impressão | Print-bridge local (Node) → ESC/POS TCP 9100 | XPrinter XP-T80Q (LAN) |
| Testes | Vitest (unit/integration) + Playwright (e2e) | |
| Monorepo | pnpm workspaces + Turborepo | |
| App futuro | Capacitor (embrulha o PWA) | Só se Play Store virar requisito |

**Regra de ouro:** cliente final (quem come) usa SEMPRE o browser. Zero instalação. PWA é só para cozinha/bar/admin.

## 3. Estrutura do repositório

```
/apps/web                 # Next.js: cliente QR + PWA cozinha/bar + admin
  /app/(public)/r/[slug]/m/[table]   # fluxo do cliente (anon)
  /app/(staff)/kitchen               # PWA cozinha/bar (auth: kitchen|bar)
  /app/(staff)/admin                 # admin do restaurante (auth: owner|manager)
  /app/api/webhooks/paysuite         # webhook de pagamento
/packages/core            # domínio puro: state machine, dinheiro, plans, zod schemas
/packages/db              # migrations SQL, seeds, tipos gerados do Supabase
/packages/paysuite        # client Paysuite + verificação webhook + provider mock
/services/print-bridge    # Node local: poll print_jobs → ESC/POS TCP
/docs/decisions           # ADRs
ROADMAP.md                # fases de execução com DoD
```

## 4. Arquitetura multi-tenant

**Princípio:** uma instância, um banco, isolamento por `tenant_id uuid NOT NULL` + RLS. **Nunca** deploy separado por restaurante.

### Regras
1. Toda tabela de domínio tem `tenant_id` + RLS habilitado. Tabela sem RLS = bug crítico.
2. `tenant_id` NUNCA vem do payload do cliente — vem do JWT (staff) ou do contexto do `qr_token` (anon, via RPC `SECURITY DEFINER`).
3. **Anon NUNCA tem SELECT direto em tabelas.** Todo acesso público passa por RPCs `SECURITY DEFINER` que validam o `qr_token` (ver seção 13.2).
4. Rota pública: `/r/{slug}/m/{table}?t={qr_token}`.

### Schema completo (DDL de referência — migrar em fases, ver ROADMAP)

```
tenants              (id uuid pk, slug text unique, name, plan text check in ('starter','pro','premium'),
                      phone, paysuite_wallet_ref, active bool default true, created_at)
memberships          (user_id uuid ref auth.users, tenant_id, role text check in
                      ('owner','manager','kitchen','bar','waiter'), pk(user_id, tenant_id))
tables               (id, tenant_id, number int, qr_token uuid unique default gen_random_uuid(), active bool)
printers             (id, tenant_id, name, ip_address inet, port int default 9100,
                      station text check in ('kitchen','bar','cold_kitchen'), active bool)
menu_categories      (id, tenant_id, name, sort int, station text check in ('kitchen','bar','cold_kitchen'))
menu_items           (id, tenant_id, category_id, name, description, price_cents int check (price_cents >= 0),
                      photo_url, available bool default true, track_stock bool default false,
                      stock_qty int check (stock_qty >= 0), sort int)
orders               (id, tenant_id, table_id, status text, total_cents int, customer_phone text,
                      loyalty_member_id uuid null, created_at, updated_at)
order_items          (id, order_id, tenant_id, menu_item_id, name_snapshot text, qty int check (qty > 0),
                      unit_price_cents int, station text, notes text)
payments             (id, tenant_id, order_id, provider text, provider_ref text, method text check in
                      ('mpesa','emola','cash'), amount_cents int, status text check in
                      ('pending','confirmed','failed','refunded'),
                      idempotency_key text unique, raw_webhook jsonb, created_at)
print_jobs           (id, tenant_id, order_id, station, printer_id null, payload jsonb,
                      status text check in ('queued','printing','printed','failed'),
                      attempts int default 0, created_at, printed_at)
loyalty_programs     (id, tenant_id unique, points_per_100_mzn int, min_points_redeem int, active bool)
loyalty_members      (id, tenant_id, phone text, current_points int default 0, unique(tenant_id, phone))
loyalty_transactions (id, tenant_id, member_id, order_id, points_change int, type text check in
                      ('earn','redeem'), created_at)
event_log            (id bigserial, tenant_id, order_id null, type text, payload jsonb, created_at)
```

Notas:
- `order_items.name_snapshot` e `unit_price_cents`: snapshot no momento do pedido (cardápio muda, histórico não).
- `event_log` é append-only (sem UPDATE/DELETE policies).

## 5. Máquina de estados do pedido (fonte única: `packages/core/src/order-machine.ts`)

```
Fluxo digital (Pro/Premium):
draft → awaiting_payment → paid → in_preparation → ready → delivered
                        ↘ payment_failed → awaiting_payment (retry)

Fluxo manual (Starter / pagamento em dinheiro):
draft → awaiting_approval → approved → in_preparation → ready → delivered

Qualquer estado não-terminal → cancelled (só staff, com motivo, logado em event_log)
```

- Pedido SÓ aparece na cozinha/bar quando `paid` ou `approved`.
- Transições SÓ via funções de servidor (RPC / route handler) que chamam a state machine do core. Update direto de `status` pelo client = proibido (e bloqueado por RLS: staff não tem UPDATE em `orders.status`, só as RPCs `SECURITY DEFINER`).
- Toda transição grava `event_log`.
- Transições de staff: RPC `advance_order(p_order_id, p_event, p_reason)` (migration `0004_kitchen.sql`). `CANCEL` exige `p_reason` não vazio — sem motivo, a transição é rejeitada. Motivo gravado no `event_log`.

## 6. Pagamentos (Paysuite) — zona crítica

### 6.1 Fluxo real (contrato VERIFICADO em 2026-06-11 contra https://paysuite.tech/docs)

> Base da API: **`https://paysuite.tech/api/v1`** (a URL `api.paysuite.co.mz` do plano inicial não existe).

1. Cliente monta pedido e clica em **"Pagar com M-Pesa"** / **"Pagar com e-Mola"** / **"Cartão"**.
2. Servidor chama `POST /api/v1/payments` da Paysuite com:
   - `amount`: string em MZN decimal (`"1250.50"`)
   - `reference`: **idempotência** — UUID do nosso `payment.idempotency_key` (máx. 50 chars)
   - `description` (opcional, máx. 125 chars)
   - `method` (opcional): `"mpesa"`, `"emola"`, `"credit_card"`
   - `return_url`: `${APP_BASE_URL}/payment/return?orderId=...`
   - `callback_url`: `${APP_BASE_URL}/api/webhooks/paysuite`
3. Paysuite retorna `{ status, data: { id, amount, reference, checkout_url } }`.
4. Servidor redireciona o cliente para `checkout_url`.
5. Cliente escolhe o número M-Pesa/e-Mola ou insere dados do cartão na página da Paysuite e confirma.
6. Paysuite executa o push ou autorização e chama nosso **webhook** com evento `payment.success` ou `payment.failed`.
7. Webhook atualiza status local e despacha `print_jobs`. Se `return_url` for chamada, o frontend faz polling do status do pedido.
8. **Webhook é a única fonte de verdade.** O retorno do navegador é apenas conveniência.

### 6.2 Webhook: assinatura e idempotência

- Header `X-Webhook-Signature`: HMAC-SHA256 do **raw body** (string) usando `PAYSUITE_WEBHOOK_SECRET`.
- Eventos: `payment.success`, `payment.failed`.
- Payload aninhado: `{ event, data: { id, amount, reference, transaction?{method}, error? }, created_at, request_id }`.
- Idempotência: campo **`data.reference`** do webhook → mapeia para nossa `payments.idempotency_key`. Duplicado → 200 OK sem efeito. (Atenção: o `request_id` do webhook é o id da ENTREGA, não a nossa idempotência.)
- Retries: 5 tentativas com backoff exponencial. Precisamos responder **2xx** em até 5 segundos.
- Webhook recebido para pedido inexistente → log em `event_log` e retorna 200 (evita retries infinitos).
- **Validações no `confirm_payment` (contrato da migration `0003_payments.sql`):**
  - Valor do webhook ≠ `orders.total_cents` → NÃO confirma o pedido; loga `payment.amount_mismatch` no `event_log` e o pagamento fica `pending` para a reconciliação (6.6) resolver. Retorna 200.
  - Pedido fora de `awaiting_payment`/`payment_failed` (ex.: cancelado antes do webhook chegar) → confirma o PAGAMENTO (o dinheiro entrou; staff trata reembolso) mas NÃO transiciona o pedido; loga `payment.confirmed_on_invalid_state`. Retorna 200.

### 6.3 Implementação obrigatória

```typescript
// packages/paysuite/src/provider.ts
interface PaymentProvider {
  createCheckout(request: {
    amountCents: Cents;       // interno
    method?: 'mpesa' | 'emola' | 'credit_card';
    idempotencyKey: string;
    returnUrl: string;
    webhookUrl: string;
  }): Promise<{ checkoutUrl: string; providerPaymentId: string }>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean;
  parseWebhook(payload: any): { event: 'success' | 'failed'; requestId: string; amount: number; providerRef: string };
}
```

### 6.4 Dinheiro: conversão centavos ↔ decimal

Interno: tudo em Cents (inteiro).

Boundary com Paysuite: (cents / 100).toFixed(2) → string "1250.50".

Do webhook: recebemos amount como string decimal → Math.round(parseFloat(amount) * 100).

Helper em `packages/core/src/money.ts`:

```typescript
export const centsToDecimalString = (cents: Cents): string => (cents / 100).toFixed(2);
export const decimalStringToCents = (decimal: string): Cents => cents(Math.round(parseFloat(decimal) * 100));
```

### 6.5 Cartão de crédito/débito

Suportado nativamente pela Paysuite (método `credit_card`).

Settlement em 1-2 dias úteis, mas o cliente vê a autorização imediata.

UI: botão "Pagar com cartão" disponível para todos os planos Pro/Premium (sem necessidade de fase separada).

Webhook `payment.success` funciona de forma idêntica.

### 6.6 Reconciliação

Cron a cada 5 min consulta `payments` com status = 'pending' e `created_at < now() - interval '5 minutes'`.

Para cada um, chama `GET /v1/payments/{providerRef}` na Paysuite e atualiza conforme status real.

Se falhar também após reconciliação, marca `failed` e libera o pedido para nova tentativa.

### 6.7 Segurança

- `PAYSUITE_API_KEY` e `PAYSUITE_WEBHOOK_SECRET` no servidor.
- `return_url` deve validar o `orderId` e exibir status do pedido (não confiar no redirect como confirmação).
- Rate-limit por IP/token nos endpoints de criação de pagamento.

### 6.8 Pagamentos por tenant (self-service — F2.5)

- Cada restaurante recebe na PRÓPRIA conta Paysuite: chaves em `tenants.paysuite_api_key_enc` / `paysuite_webhook_secret_enc`, **encriptadas** com chave-mestra `PAYMENT_KEYS_MASTER_KEY` (só servidor). Nunca em claro na BD, nunca no client.
- Admin → tab "Pagamentos" (owner only): inputs das chaves + Webhook URL pronto a copiar + botão "Testar ligação".
- Webhook multi-tenant: localizar pagamento pelo `reference` → tenant → desencriptar o secret DESSE tenant → validar HMAC. Secret de A nunca valida webhook de B.
- Sem chaves configuradas → fallback para as env vars (tenant da casa/demo).

## 7. Cozinha, bar e impressão

### PWA da cozinha (tablet Android)
- Supabase Realtime: INSERT/UPDATE em `orders` do tenant com status visível (`paid`/`approved`/`in_preparation`).
- **Som forte + vibração** em pedido novo (arquivo local, loop até ack). Requisito do piloto.
- Botões grandes (mín. 64px): "Iniciar preparo" → "Pronto". Alto contraste, fonte ≥ 18px.
- **Resiliência offline:** cache do estado em IndexedDB; banner vermelho "SEM CONEXÃO"; ao reconectar → refetch completo de pedidos abertos + reconciliação com cache.
- Heartbeat: upsert em `device_heartbeats` a cada 60s; admin vê "Cozinha online/offline".

### Roteamento por estação
- `order_item.station` herdado da categoria no momento do pedido.
- 1 pedido pago → N `print_jobs` (um por estação envolvida) + N cards no Realtime.

### Print-bridge (`/services/print-bridge`)
- Node leve rodando em mini-PC/tablet local. Config via `.env`: `TENANT_ID`, `SUPABASE_URL`, chave de serviço restrita, mapa estação→IP.
- Poll de `print_jobs.queued` (intervalo 3s) → render ESC/POS → TCP `ip:9100` → marca `printed`.
- Retry com backoff (3×); falha → `failed` + alerta visível no tablet. **Impressora é redundância; o tablet é o canal primário.** Falha de impressão NUNCA esconde o pedido.
- Cupom: nº pedido, **MESA em destaque (fonte dupla)**, itens+qty, notas, "PAGO VIA M-PESA" ou "PAGAR NO BALCÃO", hora.

## 8. Módulos Premium

### 8.1 Estoque
- Nível item: `track_stock=true` → dedução atômica na confirmação do pedido (padrão 13.4).
- `stock_qty` chega a 0 → trigger marca `available=false`.
- Checkout valida estoque DENTRO da transação; item esgotado → rejeita com lista de itens indisponíveis.

### 8.2 Dashboard gerencial
- Métricas (views materializadas ou queries agregadas): faturamento dia/semana/mês, ticket médio, divisão por método, top 10 itens, tempo médio pago→entregue, pedidos por hora (heatmap).
- Somente `owner|manager`. Refresh manual + auto 60s.

### 8.3 Fidelidade
- Cliente informa telefone no checkout (opcional).
- `earn`: floor(total_cents / 10000) × points_per_100_mzn, ao confirmar pagamento.
- `redeem`: desconto no checkout se `current_points >= min_points_redeem`. Transação atômica com `loyalty_transactions`.

## 9. Confiabilidade (regra nº 1)

> "Se UM pedido pago não chegar à cozinha em horário de pico, o restaurante perde a confiança no sistema."

- `event_log` para tudo: pedido criado, push enviado, webhook recebido, transição de status, print job criado/impresso/falho, heartbeat perdido.
- A tela da cozinha sobrevive a: refresh, queda de Wi-Fi, tablet reiniciado.
- Alerta (Fase 2): pedido `paid` sem ack > 3 min → WhatsApp/SMS ao gerente.

## 10. Comandos

```bash
pnpm dev            # web localhost:3000
pnpm test           # vitest run (single run — usado no DoD/CI)
pnpm test:watch     # vitest em modo watch (desenvolvimento)
pnpm test:e2e       # playwright
pnpm lint           # turbo lint (eslint) + typecheck por package (tsc --noEmit)
pnpm db:migrate     # aplica migrations
pnpm db:types       # regenera tipos do schema
pnpm db:seed        # tenant demo + cardápio exemplo
pnpm bridge:dev     # print-bridge com impressora simulada (printer-sim)
```

## 11. Variáveis de ambiente

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # só servidor
PAYSUITE_API_KEY=                 # só servidor
PAYSUITE_WEBHOOK_SECRET=          # só servidor
PAYMENT_PROVIDER=mock|paysuite
APP_BASE_URL=
```

## 12. O que NUNCA fazer

- ❌ Float para dinheiro. Sempre centavos inteiros.
- ❌ Tabela sem `tenant_id` + RLS.
- ❌ Anon com SELECT direto em tabela (sempre RPC com qr_token).
- ❌ Confiar no client para status de pagamento/pedido.
- ❌ Mostrar pedido na cozinha antes de `paid`/`approved`.
- ❌ Webhook sem assinatura verificada e sem idempotência.
- ❌ App nativo para cliente final.
- ❌ Acoplar sistema à impressora (papel = redundância).
- ❌ Deploy separado por restaurante.
- ❌ Pular fase do ROADMAP ou alterar contrato de fase concluída sem ADR.

## 13. PADRÕES CANÔNICOS (copiar, não reinventar)

### 13.1 Helper de tenant + template de policy RLS

```sql
-- Função helper: tenant do usuário autenticado
create or replace function auth_tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from memberships where user_id = auth.uid() limit 1;
$$;

-- Template padrão para TODA tabela de domínio:
alter table menu_items enable row level security;

create policy "staff_select" on menu_items for select
  to authenticated using (tenant_id = auth_tenant_id());

create policy "manager_write" on menu_items for all
  to authenticated
  using (tenant_id = auth_tenant_id()
         and exists (select 1 from memberships m where m.user_id = auth.uid()
                     and m.tenant_id = menu_items.tenant_id
                     and m.role in ('owner','manager')))
  with check (tenant_id = auth_tenant_id());
-- anon: NENHUMA policy. Acesso público só via RPC 13.2.
```

### 13.2 Acesso público via qr_token (RPC SECURITY DEFINER)

```sql
create or replace function public.get_menu_by_qr(p_qr_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_table record;
begin
  select t.id, t.tenant_id, t.number into v_table
  from tables t join tenants tn on tn.id = t.tenant_id
  where t.qr_token = p_qr_token and t.active and tn.active;
  if not found then raise exception 'invalid_qr' using errcode = 'P0001'; end if;

  return jsonb_build_object(
    'table_number', v_table.number,
    'tenant_id', v_table.tenant_id,
    'categories', (select coalesce(jsonb_agg(... order by c.sort), '[]'::jsonb)
                   from menu_categories c
                   where c.tenant_id = v_table.tenant_id /* + itens available */));
end; $$;
grant execute on function public.get_menu_by_qr(uuid) to anon;
```
Mesmo padrão para `create_order_by_qr(p_qr_token, p_items jsonb, p_phone text)`.

### 13.3 Idempotência de webhook

```typescript
// app/api/webhooks/paysuite/route.ts (esqueleto)
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers, env.PAYSUITE_WEBHOOK_SECRET))
    return new Response('invalid signature', { status: 401 });

  const evt = paysuiteWebhookSchema.parse(JSON.parse(raw)); // Zod
  // INSERT ... ON CONFLICT (idempotency_key) DO NOTHING; se 0 rows → duplicado
  const inserted = await markPaymentConfirmed(evt); // RPC transacional
  if (!inserted) return Response.json({ ok: true, duplicate: true }); // 200 SEMPRE

  await Promise.all([createPrintJobs(evt.orderId), logEvent('payment.confirmed', evt)]);
  return Response.json({ ok: true });
}
```

### 13.4 Dedução atômica de estoque

```sql
-- Dentro da MESMA transação que confirma o pedido:
update menu_items
set stock_qty = stock_qty - v_qty
where id = v_item_id and track_stock and stock_qty >= v_qty;
-- row_count = 0 → raise exception 'out_of_stock:<item_id>' → rollback do pedido inteiro
```

### 13.5 Dinheiro

```typescript
// packages/core/src/money.ts — único lugar que formata/calcula dinheiro
export type Cents = number & { __brand: 'cents' };
export const cents = (n: number): Cents => { 
  if (!Number.isInteger(n) || n < 0) throw new Error('invalid cents'); 
  return n as Cents; 
};
export const formatMT = (c: Cents) => 
  `${(c / 100).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT`;
export const orderTotal = (items: { qty: number; unitPriceCents: Cents }[]): Cents =>
  cents(items.reduce((s, i) => s + i.qty * i.unitPriceCents, 0));
```

## 14. Operação de sala (F2.0+)

### 14.1 Multi-cliente por mesa, dinheiro e Modo Balcão

- **Nome no pedido**: cada pessoa pede do PRÓPRIO telemóvel (mesmo QR da mesa) com campo "O teu nome" → `orders.customer_name` → card da cozinha e cupom mostram "MESA 5 — Gabriel". O garçom entrega pelo nome.
- **Dinheiro é escolha POR PEDIDO, não por plano**: botão "Pagar em dinheiro" no checkout → pedido nasce `awaiting_approval` → ecrã de aprovação (waiter/manager/owner) → APPROVE → cozinha + cupom "PAGAR NO BALCÃO" (caminho do backend já existe — migration 0008).
- **Modo Balcão** (bar lotado, gente de pé): `tables.type='counter'` → pedido pago recebe `pickup_code` de 3 chars gerado no servidor → página de status do cliente vibra/apita/fica verde com o código GRANDE quando `ready` → cliente levanta no balcão. Opcional: TV fullscreen com códigos prontos (F3.3). Ninguém procura ninguém.

### 14.2 Dividir a conta (F2.6)

- Caminho natural: 1 pessoa = 1 pedido = 1 pagamento (com nome). A conta nasce dividida.
- Split explícito: N registos em `payments` (parciais, soma = total), cada um com o seu `checkout_url`. Pedido só vai à cozinha quando `sum(confirmed) >= total_cents`. Parcela falhada → identificável + "Reenviar" isolado.
- Entrega dos links de pagamento — 4 opções por pessoa, no mesmo ecrã:
  1. **WhatsApp**: deep link `wa.me/<numero>?text=<msg>` — abre o WhatsApp de QUEM PEDE com a mensagem pronta. NUNCA usar a WhatsApp Business API para isto (burocracia/custo desnecessários; a Business API só se justifica para notificações automáticas do sistema, ex. "pedido pronto").
  2. **SMS**: deep link `sms:+258...?body=<msg>` (fallback universal, todo telemóvel tem).
  3. **Mostrar QR**: quem pediu mostra o ecrã e o amigo aponta a câmara (scanear o telemóvel de OUTRA pessoa funciona; o anti-padrão é scanear o próprio).
  4. **Copiar link**.
  - Em **tablet partilhado**: N QR codes directos no ecrã.
- **Parcela em dinheiro**: pessoa escolhe "Dinheiro" → parcela `pending` com `method='cash'` → garçom cobra e toca "Recebido" no ecrã de aprovação (RPC com role waiter/manager/owner) → conta para o `sum(confirmed)`. Progresso mostra 💵 "aguarda garçom".
- ⚠️ A Paysuite NÃO documenta push directo por msisdn (verificado 2026-06-12). Se o suporte confirmar direct charge, trocar o passo WhatsApp/SMS por push real (cliente só digita o PIN) sem alterar o resto do desenho.

### 14.3 Fecho de caixa (F2.9)

- **Sessão de caixa** (`cash_sessions`): abre no início do dia/turno, fecha com conferência. Digital (M-Pesa/e-Mola/cartão) confere-se sozinho; o fecho existe por causa do DINHEIRO físico.
- Fecho: sistema calcula `expected_cash_cents` (payments confirmed `method='cash'` da sessão) → gerente conta a gaveta → digita `counted` → diferença visível → notas obrigatórias se houver falta → snapshot **imutável** em `report` jsonb + event_log + **cupom Z** impresso (totais por método, pedidos, cancelados com motivo, diferença, linha de assinatura).
- Regras: pedido conta na sessão em que foi PAGO (não criado); fecho nunca se edita — correcção é nota no fecho seguinte; cancelamentos sempre listados com motivo (é onde se vê fuga).
- Futuro premium: caixa por garçom (cada um presta contas do cash que cobrou).

### 14.4 Modo Convivência (F2.8) e recibo fiscal (F2.7)

- **Convivência**: nunca pedir para tirar o sistema antigo. Mesa QR trata pedidos QR + pagamento; POS legado continua no balcão; mesma impressora (ESC/POS). Ponte: export CSV + webhooks de saída do event_log. Substituição só quando o dono confiar nos números.
- **Recibo fiscal (VD)**: o cupom da cozinha NÃO é documento fiscal. VD exige NUIT, endereço, numeração sequencial, IVA 16% discriminado, "Processado por computador". ⚠️ Validar regime com contabilista moçambicano ANTES de implementar — nunca prometer "factura certificada AT" sem essa validação.
