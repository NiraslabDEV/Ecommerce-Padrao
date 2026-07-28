# ROADMAP.md — Delivery OS: Roteiro de Execução em Fases

> **Como usar:** abrir o Claude Code na raiz do repo. Colar o PROMPT da fase atual, exatamente como está.
> Uma fase por sessão. A fase só está concluída quando TODO o checklist de DoD estiver verde.
> Nunca avançar com testes a falhar. Nunca deixar o agente "adiantar" a fase seguinte.

Legenda: 🔴 bloqueia tudo · 🟡 bloqueia a entrega ao 1º cliente · 🟢 melhoria
DoD: `[x]` feito (código + gate/commit) · `[x] ⏳` código pronto, falta confirmar em runtime com Supabase local · `[ ]` por fazer

> **Estado atual (2026-06-16): FASES 0–4 + extras IMPLEMENTADAS; Paysuite EM PRODUÇÃO.** `pnpm test` → **127 testes** · `pnpm lint` → 0 erros · deploy Railway ativo.
>
> Feito: F0 completa (monorepo, schema, loja, painel Pedidos, emails); F1 completa (ADD PRODUTOS, Caixa, Análise, Feedback + Lista de Espera);
> F2.1 (Paysuite mock + webhook HMAC + reconciliação cron); F2.2 (print-bridge ESC/POS formato PRAIA SHOPPING, cupom delivery, simulator);
> F2.3 (stock atómico, heartbeats impressora/admin); **F3.1 (turnkey: `pnpm setup:client` + `.env.example`/`brand.example.ts` + README de onboarding + contrato do backend para fronts + checklist).** F4 (tracking).
>
> **Correções de painel (2026-06-15, migration `...016_dashboard_fixes.sql`):**
> - Painel **Pedidos**: linha expansível com comprovativo **inline** (signed URL) + Aprovar/Negar/avançar trilha ali mesmo; botões **Iniciar preparo → Marcar pronto → Entregue(balcão)/Enviado(delivery)** (RPC `advance_order` já tinha os eventos) na Lista **e** no Calendário; ícone 👁 para ocultar Total Faturado (persistido em localStorage).
> - **Decisão fechada:** "venda confirmada" = `status in ('approved','paid','in_preparation','ready','delivered')`. `get_order_stats.ativos` passa a incluir approved/paid; `get_dashboard_metrics` (Análise) conta confirmados (não só `delivered`); `get_cash_dashboard` mostra desde o **último fecho** (não meia-noite UTC).
> - **Definições** saiu de dentro de Cardápio → tab própria (`/definicoes`). Nav admin com `flex-wrap` (a tab **Marketing** estava cortada). Cardápio mantém só Cardápio + Zonas.
> - Feedback do cliente (`/order-status`) aparece quando o pedido fica `delivered` — agora alcançável via os botões de avançar trilha.
> - Adicionada dependência `zod` em `apps/web` (faltava à rota `/api/track` da F4).
>
> **Hotfix cloud (2026-06-15, projeto `deliverysgab`):** a BD cloud tinha só migrations até `0012`. Aplicadas (via Supabase) as `0013`–`0018` em falta → resolveu o erro "function `get_funnel_metrics` not found" (Análise) e a Caixa a 0. **Migration `...018_cash_period_since_last_close.sql`:** corrige o `get_cash_dashboard` para contar SEMPRE desde o último fecho (a 0016 usava `opened_at` da sessão aberta, escondendo pedidos criados antes de abrir a caixa — furo num delivery 24/7). Validado: 3 pedidos `approved` (2340 MT) agora aparecem em Análise e Caixa.
>
> **🟢 GO-LIVE PAYSUITE + RESKIN iFood (2026-06-16):** `pnpm test` → **127 testes** · lint/build verdes · deploy Railway (`web-production-a4de0.up.railway.app`).
> - **Paysuite REAL validado com pagamento M-Pesa** (pedido → checkout → pago → `paid` → `payments` + `print_job`). Provider configurável no **admin** (Definições → Paysuite, chaves mascaradas em `settings`, migration `0019`); rotas leem `settings`→`.env` (`lib/payments/config.ts`).
> - **Bugs reais corrigidos** (descobertos contra a API): `reference` tem de ser alfanumérico (`lib/payments/reference.ts`); `return_url`/`callback_url` precisam de esquema (`resolvePublicBase`); `create_order` usava `v_menu_item.station` mas `station` vive em `menu_categories` (migration `0020`, join).
> - **Verificação ATIVA do pagamento** (`/api/payments/verify`, chamada pela `/payment/return`) — confirma `paid` **sem depender do webhook/cron** (o webhook do Paysuite aponta para outro projeto e o cron não corre no Railway). É o que evita o pedido ficar preso em "A processar".
> - **Reskin iFood do painel** (migration `0021` KPIs): novo `layout.tsx` (sidebar vertical + topbar + drawer mobile, tema vermelho `#EA1D2C`); `pedidos/page.tsx` com 6 KPIs (faturado/pedidos hoje, em preparo, prontos, cancelados, avaliação média), abas de status, tabela (desktop) + cards (mobile). `order-status` com labels PT + verde para `paid`. `MTn`→`MT` (formatMT) em menu/checkout/order-status/painel.
> - **Skill `/connect-paysuite`** (`.claude/skills/`) com o runbook + gotchas para ligar o gateway num cliente novo.
> - **Migrations aplicadas na cloud:** `0013`–`0021` (a cloud está à frente do `supabase db reset` local; ver nota de drift abaixo).
>
> **Pendente de verificação com Supabase real:** `supabase db reset` local (a cloud foi migrada via MCP — versões diferem das locais; migrations são idempotentes) + `packages/db/tests/rls.test.ts` + XPrinter físico + configurar o webhook do Paysuite no painel deles (opcional — a verificação ativa cobre) + cron de reconciliação no Railway (opcional).
> **Próximo passo:** CHECKPOINT 1 (demo ao 1º cliente); estender o reskin iFood às outras tabs; **F10 — Layout da Loja** (formato visual + mini banners, spec em `(public)/CLAUDE.md §10` + `(public)/ROADMAP.md F10`); FASE 5 (referral) se quiser.

> **Disciplina:** ler `CLAUDE.md` inteiro + a fase. Antes de codar, listar ficheiros a criar/alterar e plano de testes.
> Reaproveitar do QR MESAS (CLAUDE.md secção 13) em vez de reescrever. Single-tenant: zero `tenant_id`, zero planos.

---

## FASE 0 — Fundação + Demo de pagamento manual (1º marco)

🎯 Objetivo do checkpoint: **cliente faz pedido no site → escolhe levantamento/entrega + horário → "paga" via M-Pesa/e-Mola e envia comprovativo → dono recebe email + vê no painel → Aprova/Nega → cliente recebe email.** Sem Paysuite, sem impressora.

### F0.1 🔴 Esqueleto do monorepo + reaproveitamento

**PROMPT:**
> Lê o `CLAUDE.md` (secções 2, 3, 13, ⚡). Cria o esqueleto: pnpm workspaces + Turborepo com `apps/web` (Next.js 14 App Router + TS + Tailwind + shadcn/ui), `packages/core`, `packages/db`, `packages/paysuite`, `services/print-bridge`, e `config/brand.ts`. **Porta do QR MESAS** (`C:\Users\Gabriel\Desktop\QR MESAS`): `packages/core/src/money.ts` e `order-machine.ts` (intactos), `packages/paysuite/src/*` (intacto), `services/print-bridge/src/*` (remove `TENANT_ID`). **NÃO** portar `plans.ts`. Cria `config/brand.ts` com os tokens do tema HawSmash (`--gold #e5a93c`, fundo escuro, fontes) mapeados para o Tailwind. Configura Vitest, ESLint, tsconfig partilhado e os scripts da secção 10 (os que ainda não funcionam apontam para `echo TODO`). Não implementes lógica de domínio nova. 1 teste trivial por package a provar que o Vitest corre.

**DoD:**
- [x] `pnpm install && pnpm lint && pnpm test && pnpm dev` funcionam (lint/test/build verdes)
- [x] `apps/web` abre com o tema escuro/dourado
- [x] `money.ts`, `order-machine.ts` e `packages/paysuite` portados, testes a passar (47), **sem** `tenant_id`/planos
- [x] Commit `chore: monorepo skeleton + reuse core/paysuite/print-bridge` (`1cef5f3`)

### F0.2 🔴 Banco single-tenant + RLS + RPCs públicas

**PROMPT:**
> Lê o `CLAUDE.md` (secções 4, 7, 12, 14). Cria `packages/db/migrations/0001_core.sql`: tabelas `settings` (singleton), `menu_categories`, `menu_items`, `delivery_zones`, `orders`, `order_items`, `event_log` (DDL da secção 4); RLS em TODAS (template 14.1 — `anon` sem policy); RPCs `SECURITY DEFINER` `get_menu()`, `get_order_status(p_order_id)` e `create_order(p_payload jsonb)`. O `create_order` valida itens contra `menu_items` (**preço do BANCO**), valida a zona e calcula `delivery_fee_cents`, valida o `scheduled_for` (slot futuro dentro de `open_hour`–`close_hour` ou null=AGORA), cria o pedido em `awaiting_approval` (flow `manual`), grava snapshots e `event_log`, gera `order_number`, retorna `order_id`. Cria `seed.sql` (settings demo, 3 categorias, ~8 itens em centavos, 3 zonas) e `tests/rls.test.ts` (Vitest contra Supabase local): (a) anon não lê tabela nenhuma; (b) `get_menu` devolve menu+zonas; (c) preço/taxa adulterados no payload não afetam o total; (d) horário inválido é rejeitado.

**DoD:**
- [x] ⏳ `supabase db reset` aplica migration + seed (migrations escritas; não corridas aqui — sem Supabase local)
- [x] ⏳ Testes de RLS/RPC (`packages/db/tests/rls.test.ts` escritos; requerem `supabase start`)
- [ ] `pnpm db:types` gera tipos (requer Supabase local)
- [x] Commit `feat(db): single-tenant core schema + public RPCs` (`0974015`)

### F0.3 🔴 Loja do cliente (cardápio → carrinho → checkout manual → status)

**PROMPT:**
> Lê o `CLAUDE.md` (secções 6.1, 7, 14.2). Implementa a rota pública `/`: `get_menu()`, cardápio por categoria (foto, preço com `formatMT`), carrinho client-side (TanStack Query + estado local), e `/checkout`: nome + telefone, **Levantamento ou Entrega** (se entrega: escolher zona → taxa somada, morada obrigatória), **agendamento** (Agora ou slots de 30 min do dia), escolha **M-Pesa/e-Mola**. Ao enviar → `create_order` → pedido `awaiting_approval`. Ecrã de pagamento manual: mostra número+nome do `settings`, instruções, e **upload do comprovativo** para o bucket privado `payment-proofs` (guarda `payment_proof_path`). Cria a migration `0002_storage.sql` (bucket privado + policies). Página `/order-status/[orderId]` faz polling de `get_order_status`. Mobile-first (360px).

**DoD:**
- [x] ⏳ Menu → carrinho → entrega+zona+horário → criar pedido (carrinho completo: `useCart` + Adicionar/stepper + drawer no `/menu` → `/checkout`; falta run com BD)
- [x] ⏳ Comprovativo no bucket privado + `attach_payment_proof` → `payment_proof_path`; pedido em `awaiting_approval`
- [x] Total = subtotal + taxa da zona (recalculado no servidor em `create_order`)
- [x] Commit `feat(web): storefront + manual checkout with proof upload` (`a133a02`)

### F0.4 🔴 Painel: tab Pedidos + emails transacionais

**PROMPT:**
> Lê o `CLAUDE.md` (secções 5, 8). Implementa o painel admin (auth Supabase) com o shell de tabs (**Pedidos · Caixa · Análise · Feedback · Lista de Espera**) no visual HawSmash — só a tab **Pedidos** funcional nesta fase. Pedidos: cards de stat no topo, busca, filtros, vista **Lista** e **Calendário** (agrupar por dia/horário). Botões **Aprovar** (RPC `advance_order` APPROVE → `approved`) e **Negar** (`CANCEL` com motivo → `cancelled`), **Ver comprovativo** (`createSignedUrl`). Route handlers de email (Resend): em `create_order` → email ao `OWNER_EMAIL` ("novo pedido + comprovativo"); em Aprovar → email ao cliente ("pagamento confirmado"); em Negar → email ao cliente ("pagamento não confirmado"). Reaproveita o padrão de `orders-section.tsx` do QR MESAS (sem gating por plano).

**DoD:**
- [x] ⏳ Login do dono (`/login`) → tab Pedidos com lista e calendário (falta run com BD)
- [x] "Ver comprovativo" gera signed URL do bucket privado (`createSignedUrl`)
- [x] ⏳ Aprovar/Negar via `advance_order` + emails (dono no comprovativo; cliente na aprovação/recusa, se deu email)
- [x] `kitchen` não acede ao painel (`role=kitchen` → redirect); `authenticated` acede
- [x] Commit `feat(admin): orders tab (list+calendar), approve/deny, transactional emails` (`76f01b8`)

🎉 **CHECKPOINT 1: demo de pagamento manual ponta-a-ponta. Já dá para mostrar/vender. Marcar conversas com restaurantes ANTES de continuar.**

---

## FASE 1 — Painel completo (ADD PRODUTOS, Caixa, Análise, Feedback)

### F1.1 🟡 ADD PRODUTOS — gestão de cardápio + zonas + settings

**PROMPT:**
> Lê o `CLAUDE.md` (secção 8). Implementa a gestão de cardápio: CRUD de `menu_categories` e `menu_items` (nome, descrição, **preço MT→centavos no submit**, foto via Storage, toggle `available`, e os campos de **estoque** `track_stock`/`stock_qty` já no formulário). CRUD de `delivery_zones` (nome, taxa). Edição de `settings` (números/nomes M-Pesa/e-Mola, morada, horários `open_hour`/`close_hour`/`slot_minutes`, `accepting_orders`). Reaproveita `menu-section.tsx` do QR MESAS, sem gating por plano. Migration aditiva se faltar coluna.

**DoD:**
- [x] ⏳ Dono cria item com foto/preço/descrição → aparece na loja imediatamente (código implementado; falta run com Supabase real)
- [x] ⏳ Dono cria/edita zona de entrega → reflete no checkout
- [x] ⏳ Dono fecha a loja (`accepting_orders=false`) → checkout bloqueado com aviso
- [x] Commit `feat(admin): menu CRUD, delivery zones, settings` (`4e82668`)

### F1.2 🟡 Caixa (fecho do dia)

**PROMPT:**
> Lê o `CLAUDE.md` (secção 8). Migration `cash_sessions` + RPCs `open_cash_session()` / `close_cash_session(p_counted_cents, p_notes)` (SECURITY DEFINER; o fecho calcula o esperado a partir dos pagamentos confirmados do período, congela snapshot imutável em `report`, grava `event_log`). Tab **Caixa**: painel ao vivo (total pedidos, faturado, entregues, por fechar, vendido por unidade — como na screenshot), botão **Fechar caixa**, notas, **histórico**, **download PDF** e **email** do fecho. Reaproveita o desenho de fecho de caixa do QR MESAS.

**DoD:**
- [x] ⏳ Dia com pedidos: "Fechar caixa" mostra o esperado certo e regista o fecho (código implementado; falta run com Supabase real)
- [x] ⏳ Fecho gera PDF e envia email; histórico lista fechos anteriores
- [x] ⏳ Fecho de ontem não muda quando entram pedidos hoje (imutável — snapshot em `report`)
- [x] Commit `feat(admin): cash session close with PDF + email` (`6bcd0d3`)

### F1.3 🟢 Análise (dashboard)

**PROMPT:**
> Lê o `CLAUDE.md` (secção 8). Migration com views de métricas (faturação dia/semana/mês, ticket médio, top itens, **Como recebem: Levantamento vs Entrega**, horários de pico/heatmap, clientes que mais compraram) — adapta `0010_dashboard_views.sql` do QR MESAS para single-tenant. Tab **Análise** (Recharts) com filtros 7 dias / 30 dias / tudo, igual à screenshot. Teste: views batem com um seed conhecido.

**DoD:**
- [x] ⏳ Métricas batem com o seed (views SQL implementadas; falta run com Supabase real)
- [x] ⏳ Split Levantamento/Entrega visível; heatmap de horários; top clientes
- [x] Commit `feat(admin): analytics dashboard` (incluído em `c19be80`)

### F1.4 🟢 Feedback + Lista de Espera

**PROMPT:**
> Lê o `CLAUDE.md` (secção 8). Tabelas `order_feedback` e `waitlist` (INSERT anon **com rate-limit no DB**, ler só `authenticated`). UI pública: pedir feedback após entrega; captar contacto quando a loja está fechada (`accepting_orders=false`). Tabs **Feedback** e **Lista de Espera** no painel.

**DoD:**
- [x] ⏳ Cliente envia feedback → aparece na tab Feedback (código implementado; falta run com Supabase real)
- [x] ⏳ Loja fechada → captura na Lista de Espera; rate-limit testado
- [x] Commit `feat(admin): feedback + waitlist` (incluído em `c19be80`)

---

## FASE 2 — Pagamento automático (Paysuite) + Impressora térmica

### F2.1 🟡 Paysuite (fluxo digital)

**PROMPT:**
> Lê o `CLAUDE.md` (secção 6.2/6.4) e a secção 6 do CLAUDE do QR MESAS. Liga o `PaysuiteProvider` (já portado): `/api/payments` cria checkout e redireciona para `checkout_url`; `/api/webhooks/paysuite` (HMAC do raw body, idempotência por `data.reference`, eventos `payment.success`/`payment.failed`); `confirm_payment` (RPC transacional, validações da secção 6.4); `/payment/return` faz polling; cron `/api/cron/reconcile` a cada 5 min para pendências > 5 min. No checkout, opção "Pagar automático" cria o pedido em `awaiting_payment` (flow `digital`). Chaves via env (single-tenant, **sem** encriptação por-tenant). Emails em sucesso/falha. Mensagens de erro em PT.

**DoD:**
- [x] ⏳ Fluxo com `PAYMENT_PROVIDER=mock`: pedido → redirect → "paga" → webhook → `paid` → aparece no painel (código + testes mock; falta run e2e)
- [x] ⏳ Webhook duplicado (mesmo `reference`) → 200 sem efeito; assinatura inválida → 401
- [x] ⏳ Reconciliação corrige webhook perdido em ≤ 5 min
- [x] **Paysuite configurável no admin** (tab Definições → secção Paysuite, padrão masked): `payment_provider` + `paysuite_api_key` + `paysuite_webhook_secret` em `settings` (migration `0019`); rotas leem settings→env (`lib/payments/config.ts`).
- [x] **Token real validado** contra `paysuite.tech/api/v1/payments` → HTTP 201 + checkout_url.
- [x] **Bugfix crítico:** Paysuite exige `reference` **só alfanumérico** (devolvia 422 com `order_<uuid>`). `lib/payments/reference.ts` (`orderToReference`/`referenceToOrderId`, 4 testes) usado em checkout/webhook/reconciliação com idempotência consistente.
- [ ] (E2E real no deploy: pagar via checkout_url → webhook → `paid` — pendente de push + webhook URL no painel Paysuite)
- [x] Commit `feat(payments): Paysuite digital flow, HMAC webhook, reconciliation` (`5e20d48`) + fix (`cabb21b`) + admin config & reference fix

### F2.2 🟡 Impressora térmica (print-bridge 24/7)

**PROMPT:**
> Lê o `CLAUDE.md` (secção 9) e o `README.md` (secção "Formato do Cupom Térmico"). Liga o `print-bridge` (já portado, sem `TENANT_ID`) com estas três tarefas:
>
> **(1) Payload completo no print_job** — os RPCs `confirm_payment` (pedido `paid`) e `advance_order APPROVE` (pedido `approved`) devem criar o `print_job` com payload completo:
> ```ts
> { order_number, customer_name, customer_phone,
>   fulfillment_type, delivery_zone, address, scheduled_for,
>   items: [{ name, qty, notes }],
>   payment_method, payment_status,
>   subtotal_cents, delivery_fee_cents, total_cents, created_at }
> ```
> Se o payload já existia mas era mínimo (v. migration 0009), adiciona migration aditiva para não quebrar dados.
>
> **(2) Actualizar `services/print-bridge/src/escpos.ts`** para o formato padrão moçambicano (ref: PRAIA SHOPPING LDA, Maputo). Papel **58 mm (~48 chars/linha, codepage CP1252)**:
>
> ```
> ================================================
>       NOME DO RESTAURANTE (brand.ts)
>       www.restaurante.co.mz
> ================================================
> PEDIDO: ENC-0042         14/06/2026  14:25
> ================================================
> CLIENTE: MARIA ALBERTINA       ← double-height bold
> TEL:     +258 84 123 456
> ================================================
> ** ENTREGA **   (ou  ** LEVANTAMENTO **)  ← bold, centrado
> Zona:    Sommerschield
> Morada:  Av. Julius Nyerere, 100
> HORARIO: 14:30  (ou  HORARIO: AGORA)
> ================================================
> Descricao              Qty       Total
> ------------------------------------------------
> Caril de Camarao        x2    130.00 MT
>   > bem apimentado
> Sumo de Manga           x1     25.00 MT
> ================================================
> Subtotal:                     155.00 MT
> Taxa de entrega:               20.00 MT   ← omitir se pickup
> ================================================
> TOTAL:                        175.00 MT   ← double-height bold
> ================================================
> [ PAGO VIA M-PESA ]                       ← bold, centrado
> (ou: [ PAGAR NA ENTREGA ] / [ PAGAR NO LEVANTAMENTO ])
> ================================================
> Obrigado! Bom apetite!                    ← centrado
> 14/06/2026  14:25:33                      ← centrado
> ================================================
>                                           ← feed 3 linhas + GS V 0x00 (corte)
> ```
>
> Regras de layout: nome do item truncado a 22 chars; qty `xN` alinhado à col 23; total em MT alinhado à direita; nota do item começa com `  > `; taxa de entrega só aparece se `delivery_fee_cents > 0`; `payment_status='paid'` → `PAGO VIA <MÉTODO>`, senão `PAGAR NA ENTREGA/LEVANTAMENTO`.
>
> **(3) Bridge poll** — `print_jobs.queued` (3 s) → ESC/POS → TCP `ip:9100` → `printed`; retry 3× com backoff exponencial (1 s, 3 s, 9 s) → `failed` + `event_log`. Falha de impressão NUNCA bloqueia o pedido no painel. Mantém `printer-sim` para `pnpm bridge:dev` (decode CP1252 → console legível).

**DoD:**
- [x] `pnpm bridge:dev` mostra o cupom decodificado no console ao aprovar/pagar pedido — **7 testes escpos + 15 testes integração verdes**
- [x] Cupom segue o formato PRAIA SHOPPING: separadores `=`, itens com qty+total alinhados, TOTAL double-height
- [x] Taxa de entrega só aparece em pedidos de entrega; campo omitido em levantamento
- [x] Falha de impressão NÃO esconde o pedido no painel (job → `failed` + event_log)
- [ ] (XPrinter real via LAN — pendente de hardware)
- [x] Commit incluído em `feat(ops): atomic stock + device heartbeats` (`86d6be2`)

### F2.3 🟢 Estoque + heartbeats

**PROMPT:**
> Lê o `CLAUDE.md` (secções 8, 9, 14.4). Dedução atómica de `stock_qty` no `confirm_payment`/aprovação (padrão 14.4), trigger `stock_qty=0 → available=false`, ajustes manuais logados no admin. Heartbeat do print-bridge/admin (`device_heartbeats`, upsert 60s) com indicador online/offline no painel. Testes: pedido com item esgotado → rollback total; 2 pedidos a disputar o último item → só 1 confirma.

**DoD:**
- [x] Rollback total quando item esgota dentro da transação (teste verde) — **testes de stock passam**
- [x] ⏳ Concorrência: só 1 dos 2 pedidos confirma o último item (lógica implementada; teste de concorrência real requer BD)
- [x] ⏳ Painel mostra impressora online/offline (heartbeat implementado; falta run com BD)
- [x] Commit `feat(ops): atomic stock + device heartbeats` (`86d6be2`) + fix (`cabb21b`)

---

## FASE 3 — Empacotar para revenda (turnkey)

### F3.1 🟡 Onboarding self-service do template

**PROMPT:**
> Lê o `CLAUDE.md` (secção 15). Cria `.env.example`, `config/brand.example.ts`, e um `README.md` "Como instalar para um cliente novo" (clonar → editar `brand.ts` + assets → `.env` → `pnpm db:migrate && db:seed` → configurar settings/menu/zonas no admin → deploy Vercel → opcional print-bridge). Script `pnpm setup:client` que valida `.env` e `brand.ts` e corre as migrations. Checklist de entrega por cliente.

**DoD:**
- [x] Um restaurante novo fica operacional em < 30 min seguindo o README (`.env.example` + `config/brand.example.ts` + README turnkey + checklist `docs/onboarding-checklist.md`), sem editar lógica
- [x] `pnpm setup:client` falha com mensagem clara se faltar env/brand (validado: sem `.env` → erro + exit 1; `PAYMENT_PROVIDER=paysuite` sem chaves → erro; placeholders rejeitados) — **12 testes Vitest verdes**
- [x] Commit `docs(template): client onboarding + setup script`

---

## Extras (pós-roadmap)

### EX.1 🟢 Importação de cardápio (formato canónico `menu.json`)

Padrão aceito para carregar produtos em massa (ex.: "organiza os produtos do site X" → ficheiro → loja).
Agnóstico de design: alimenta a BD; qualquer front lê via `get_menu()`.

- Formato + spec: [`docs/menu-format.md`](docs/menu-format.md) + [`examples/menu.example.json`](examples/menu.example.json)
- Schema/validação + conversão de preço (centavos via money.ts): `packages/core/src/menu-import.ts`
- Absorvedor reutilizável: RPC `import_menu(p_payload jsonb)` (idempotente, `authenticated`) — migration `0013`
- CLI: `pnpm menu:import <ficheiro.json> [--dry-run]`

**DoD:**
- [x] `pnpm menu:import … --dry-run` valida e mostra resumo (preços convertidos) — testado
- [x] Erro claro com nome do item em preço/JSON inválido — testado; **9 testes Vitest (menu-import)**
- [x] ⏳ RPC `import_menu` aplica upsert idempotente por nome (migration escrita; falta run com Supabase real)
- [x] Commit `feat(admin): canonical menu import (menu.json) + import_menu RPC + CLI`

### EX.2 🟡 Paysuite go-live (config no admin + verificação ativa)

Pagamento automático Paysuite ligado e **validado com pagamento real M-Pesa** em produção (Railway).

- Provider configurável no admin: Definições → Paysuite (`paysuite_section.tsx`), chaves em `settings` (migration `0019`, segredos B), `lib/payments/config.ts` lê settings→env.
- `lib/payments/reference.ts` — `reference` alfanumérico (`ord`+hex); `resolvePublicBase` — URLs com esquema.
- `/api/payments/verify` — verificação ativa na página de retorno (não depende do webhook/cron).
- Skill [`/connect-paysuite`](.claude/skills/connect-paysuite/SKILL.md).

**DoD:**
- [x] Pagamento real M-Pesa → `paid` + `payments` + `print_job` (validado contra a API real)
- [x] Chaves no admin (mascaradas); rotas leem settings→env; reference/return_url corrigidos (4 testes reference)
- [x] Página de retorno confirma sem webhook (verify); commit `feat(payments): Paysuite admin config + reference fix` + `feat(payments): active payment verification`
- [ ] (Opcional) webhook URL no painel Paysuite a apontar para este deploy + cron de reconciliação no Railway

### EX.3 🟢 Reskin iFood do painel admin (responsivo)

Painel admin reestilizado ao estilo iFood (referência do dono).

- `layout.tsx`: sidebar vertical + topbar + drawer mobile, tema vermelho `#EA1D2C`.
- `pedidos/page.tsx`: 6 KPIs (migration `0021`: faturado/pedidos hoje, em preparo, prontos, cancelados, avaliação média), abas de status, tabela (desktop) + cards (mobile). Preserva aprovar/negar/avançar/comprovativo/modal.
- `order-status`: labels PT + verde para `paid`. `MTn`→`MT` (formatMT).

**DoD:**
- [x] Layout sidebar + KPIs + tabela/cards responsivos; lint/build verdes
- [x] `get_order_stats` estendido (migration `0021`, aplicado na cloud)
- [x] Commit `feat(admin): iFood-style dashboard — sidebar layout + Pedidos KPIs/table`
- [ ] Estender o reskin às outras tabs (Caixa/Análise/Cardápio/…) — pendente

### EX.4 🟡 Cortes de preço (promoções) + Importar/Exportar produtos

Baixar preço num produto ("de 1200 por 900"), numa categoria ("todos os perfumes -30%") ou na loja
inteira ("tudo -50%") — **sem** reescrever o preço dos produtos. Exportar/importar a lista de produtos
(JSON canónico ou CSV para Excel) pelo painel ou pelo CLI.

- **Padrão + spec:** [`docs/precos-e-promocoes.md`](docs/precos-e-promocoes.md) · resumo em `CLAUDE.md` §20
- Migration `20260728000003_promotions.sql`: `menu_items.compare_at_price_cents`, tabela `promotions`
  (escopo store/category/item, pct/cents, janela de datas, RLS staff), funções
  `promo_discount_cents` / `effective_price_cents` / `effective_price`, `get_menu` + `get_related_products`
  + `create_order` a usar a MESMA função, `import_menu` com `compare_at_price_cents`, `export_menu()`.
- Espelho TS (preview/testes): `packages/core/src/pricing.ts`; import/export: `menu-export.ts` (+ CSV).
- Painel: `Catálogo` → abas **Promoções** e **Importar / Exportar** (`promotions-section.tsx`, `menu-io-section.tsx`).
- Loja: preço riscado + badge `-N%` (`PriceWithCut`/`DiscountBadge` em `menu-ui.tsx`) no card, PDP e relacionados.
- CLI: `pnpm menu:export [ficheiro.json|.csv]`; `pnpm menu:import` passa a aceitar CSV.

**DoD:**
- [x] Campanha de loja/categoria/produto muda o preço na vitrine E na cobrança (mesma função SQL)
- [x] Descontos não acumulam (vence o maior); expirada/desligada não corta; preço nunca fica negativo
- [x] Preço adulterado no payload continua ignorado pelo `create_order`
- [x] Export → editar → import faz round-trip sem perder nada (JSON e CSV, incl. `preco_antes`)
- [x] `pnpm lint` + `pnpm test` verdes (**105 testes core**, +40 novos) e **9 testes de integração**
      (`packages/db/tests/promotions.test.ts`) verdes contra o Supabase local, com a migration aplicada
- [ ] Aplicar a migration `20260728000003` na BD cloud (produção) — pendente

---

## FASE 4 — Marketing & Tracking (GTM + GA4 + Meta + Ads + CAPI) — spec COMPLETA

> 🎯 Funil inteiro medido em GTM/GA4/Meta Pixel/Google Ads, eventos first-party como fonte de verdade, e
> atribuição protegida contra iOS/adblock com Meta CAPI + Google Enhanced Conversions. KPIs no painel **Análise**.
> Single-tenant: config em `settings`, **sem** `tenants`/`tenant_id`. Ler `CLAUDE.md` secção 16 (completa).

### F4.1 🟢 Config de marketing 100% no admin (IDs públicos + tokens secretos)

**PROMPT:**
> Lê `CLAUDE.md` (16.2). Migration aditiva `0014_tracking.sql`: em `settings`, campos (A) públicos — `gtm_container_id`, `meta_pixel_id`, `ga4_measurement_id`, `gads_conversion_id`, `gads_conversion_label` — e (B) secretos — `meta_capi_token`, `gads_developer_token`. `get_menu()` devolve **SÓ** (A), com colunas listadas explicitamente (nunca `select *`). Os secretos (B) são lidos só server-side (service role ou RPC `get_secret_settings()` restrita a `authenticated`); precedência: `settings` (B) → fallback `.env`. Admin → tab **Marketing** (owner only): inputs com link "onde encontrar"; tokens **mascarados** (`••••1234` + "Substituir"); **botão "Testar ligação"** (valida CAPI/Ads sem expor token); **preview do `dataLayer`**. Mantém `META_CAPI_TOKEN`/`GOOGLE_ADS_DEVELOPER_TOKEN` no `.env.example` como fallback opcional.

**DoD:**
- [x] Dono cola IDs **e** tokens na tab Marketing (`/marketing`) → tudo configurado sem tocar em `.env` (migration `0014` + `marketing-section.tsx`)
- [x] ⏳ `get_menu()` devolve só os campos (A); **nenhum** token (B) sai em RPC anon (`packages/db/tests/tracking.test.ts` escrito; requer `supabase start`)
- [x] Tokens mascarados na UI (`••••1234` + "Substituir"); preview do `dataLayer` na tab _(botão "Testar ligação" fica para F4.5 quando houver chamada server-side a validar)_
- [x] `pnpm lint && pnpm test` verdes (83 testes); commit `feat(admin): marketing config in settings (public IDs + secret tokens) + tab`

### F4.2 🟢 Módulo de tracking + funil do storefront

**PROMPT:**
> Lê `CLAUDE.md` (16.1, 16.3, 16.4, 16.7). Cria `apps/web/lib/analytics/track.ts` (único lugar que toca `dataLayer`/`fbq`/`gtag`): `loadGTM`, `trackViewMenu`, `trackViewItem`, `trackAddToCart`, `trackBeginCheckout`, `trackAddPaymentInfo`, `trackLead`, `trackCouponApplied` (+ `trackPurchase` usado em F4.3). Banner de consentimento PT (cookie `dl_consent`): GTM/Pixel/Ads só carregam após "Aceitar". Instrumenta storefront/checkout nos gatilhos da tabela 16.4. NENHUM componente chama `fbq`/`gtag` direto.

**DoD:**
- [x] Eventos do funil disparam nos gatilhos certos (`view_menu`, `add_to_cart`, `begin_checkout`, `add_payment_info`, `lead`); componentes só chamam `track*()` — `fbq`/`gtag`/`dataLayer` vivem só em `lib/analytics/track.ts`
- [x] Sem consentimento (`dl_consent`) → `initTracking` não carrega script nenhum (banner em `AnalyticsProvider`)
- [x] Manual do dono em `docs/marketing-setup.md` (onde achar cada ID + FAQ) + link na tab Marketing
- [x] `pnpm lint && pnpm test` verdes (91 testes; 8 novos de tracking); commit `feat(web): tracking module + consent + funnel events`

### F4.3 🟢 `purchase` no order-status (regra crítica + items[])

**PROMPT:**
> Lê `CLAUDE.md` (16.1, 16.3, 16.5). Estende `get_order_status` para devolver `order_items(menu_item_id, name_snapshot, qty, unit_price_cents)`. Em `/order-status/[orderId]`, `trackPurchase` dispara **APENAS** quando `status ∈ {paid, approved}`, com guard `useRef` **+** `localStorage['tracked_purchase_<orderId>']`. Push na ordem: `ecommerce:null` → GA4 (`transaction_id`, `value` MT via money.ts, `currency:'MZN'`, `items[]`) → Google Ads `conversion` (`send_to`) → `fbq Purchase` com `eventID:'purchase_<orderId>'`, `content_ids`, `contents[]`. Testes: `purchase` não dispara fora de paid/approved; não re-dispara em reload (localStorage); value correto via money.ts.

**DoD:**
- [x] `purchase` só em `paid`/`approved`; nunca no submit do checkout (guard `shouldFirePurchase` + `isPurchaseStatus` — **7 testes**)
- [x] Não re-dispara em reload (ref `useRef` + `localStorage['tracked_purchase_<orderId>']`); `items[]`/`contents[]` preenchidos via `order_items` (migration `0015` estende `get_order_status`); value via money.ts
- [x] Commit `feat(analytics): purchase event with dedup + item details`

### F4.4 🟢 First-party events + KPIs no painel

**PROMPT:**
> Lê `CLAUDE.md` (16.6, 16.9). Migration `analytics_events` (aditiva, RLS 14.1). Rota `POST /api/track` (Zod + `session_id` cookie + `customer_phone` se identificado; insere via service role, **anon nunca direto**). Espelha os eventos de funil para first-party. View SQL do funil (taxas de conversão por etapa + utm). Aba **Análise**: funil + origem + ROAS aproximado. Testes: view bate com seed; anon não insere direto.

**DoD:**
- [x] `analytics_events` gravado só via `/api/track`; funil + utm visíveis na aba Análise
- [x] View do funil bate com seed conhecido (12 testes: 4 sessões seed → 75%/66.7%/100%/50%)
- [x] Commit `feat(analytics): first-party funnel + conversion KPIs`

### F4.5 🟢 Server-side: Meta CAPI + Google Enhanced Conversions

**PROMPT:**
> Lê `CLAUDE.md` (16.8). Em `confirm_payment` (digital → `paid`) e no handler de `advance_order APPROVE` (manual → `approved`), disparar **fire-and-forget** (nunca bloqueia o pedido): Meta Conversions API com `event_id:'purchase_<orderId>'` (dedup com o browser) usando `META_CAPI_TOKEN`; Google Offline/Enhanced Conversion com `transaction_id=order.id` usando `GOOGLE_ADS_DEVELOPER_TOKEN`. Falha → log em `event_log`, pedido segue. Testes: falha de envio não altera estado do pedido; event_id igual ao do browser.

**DoD:**
- [x] CAPI/Enhanced disparam na confirmação (digital e manual) com o mesmo `event_id`/`transaction_id` do browser
- [x] Falha server-side nunca afeta o pedido (log em event_log, fire-and-forget) — 7 testes verdes
- [x] Commit `feat(analytics): Meta CAPI + Google Enhanced Conversions (server-side)`

---

## FASE 5 — Indique e Ganhe + Presente/Cupom

> 🎯 Código de indicação por pessoa; amigo aplica → ganha desconto ou item grátis. Auto-resgate bloqueado,
> 1 resgate por código/cliente, tudo validado no servidor. Ler `CLAUDE.md` secção 17 + schema 19.

### F5.1 🟢 Cupom/referral no servidor

**PROMPT:**
> Lê `CLAUDE.md` (17.1, 19). Migration aditiva: `referral_codes`, `referral_redemptions`, `menu_items.is_gift`, `orders.referral_code/discount_cents/gift_item_id`. RPC `validate_referral(p_code, p_phone)` (read-only, SECURITY DEFINER → `{valid, reward_type, reward_value, gift_item}`). Estende `create_order`: aceita `referral_code` no payload, revalida (auto-resgate `owner_phone==customer_phone` → rejeita; já resgatado → rejeita; mesmo telefone repetido → rejeita; inativo/expirado → rejeita), aplica desconto/brinde **a preço 0**, no máx 1 item `is_gift`, grava `referral_redemptions` + `event_log`. Total recalculado no servidor. Testes Vitest: auto-resgate rejeitado; 2º resgate rejeitado; item `is_gift` sem cupom é recusado; desconto adulterado no payload é ignorado.

**DoD:**
- [x] Auto-resgate e resgate duplicado rejeitados (teste verde)
- [x] Item grátis só entra com cupom válido, máx 1; total recalculado no servidor
- [x] Commit `feat(referral): server-validated coupons + gift items`

### F5.2 🟢 Barra de código + categoria "SEU PRESENTE" no front

**PROMPT:**
> Lê `CLAUDE.md` (17.2). Barra abaixo da hero: "Coloque aqui o código do seu amigo" → `validate_referral` → libera categoria **SEU PRESENTE** (1 item a 0, só preview) e/ou mostra desconto previsto. O código viaja no `p_payload` do checkout; preço final só do `create_order`. Geração de código estável por cliente. `track('coupon_applied')`.

**DoD:**
- [x] Código válido libera 1 presente + mostra desconto previsto (preview); inválido dá erro PT
- [x] Preview nunca define o total — confirmado pelo servidor no `create_order`
- [x] Commit `feat(web): referral bar + SEU PRESENTE category`

---

## FASE 6 — Entrada personalizada + Gamificação

> 🎯 Tela de entrada (gate) pedindo telefone → personaliza (favoritos/últimas compras). Modo "energizado":
> carrinho cresce → site brilha; bater meta → brinde. Ler `CLAUDE.md` secção 18.

### F6.1 🟢 Gate de entrada + personalização soft

**PROMPT:**
> Lê `CLAUDE.md` (18.1, 19). Migration `customers` (aditiva). RPC `identify_customer(p_phone, p_name?)` (SECURITY DEFINER): upsert + devolve histórico LEVE (favoritos derivados, resumo das últimas compras) — **nunca** morada/comprovativo/pagamento (`// DECISÃO:` soft login sem OTP). Tela de entrada não-scrollável com imagem de `brand.ts` + campo telefone + "Entrar" (e link "ver cardápio" para pular). Cookie `dl_phone`. Favoritos com ❤️ e "Pedir de novo".

**DoD:**
- [ ] Telefone conhecido → favoritos + últimas compras; RPC não devolve PII sensível
- [ ] Gate pulável (não bloqueia venda); telefone liga aos `analytics_events`
- [ ] Commit `feat(web): entry gate + soft personalization`

### F6.2 🟢 Modo energizado + meta de brinde

**PROMPT:**
> Lê `CLAUDE.md` (18.2, 19). Aditivos `settings.gift_goal_cents`/`gift_goal_item_id`. Brilho progressivo do site/botão Finalizar derivado do subtotal (CSS `--gold`, sem libs pesadas). Barra "Faltam X MT para o seu brinde 🎁". Ao bater a meta, o **`create_order`** adiciona o item-prémio a 0 (validado no servidor, não no client). Teste: brinde concedido só quando subtotal ≥ meta no servidor; client adulterado não força brinde.

**DoD:**
- [ ] Brilho/progresso reativos ao carrinho; brinde concedido só pelo servidor ao bater a meta
- [ ] Client adulterado não força brinde (teste verde)
- [ ] Commit `feat(web): gamified cart glow + gift goal`

---

## Visão futura (NÃO implementar sem ADR — fora do single-tenant atual)

### V.1 🟢 "Modo iFood" — app do dono recebe pedido + chat em tempo real
Ideia do dono: cada restaurante recebe pedidos num app dedicado e conversa com o cliente. **Atenção:** isto colide com
"single-tenant = um deploy" se virar marketplace multi-restaurante. Caminhos possíveis (decidir em ADR antes):
(a) **PWA do dono** sobre o painel atual (push de novo pedido + chat por pedido via Realtime) — fica single-tenant, viável; ou
(b) **agregador multi-restaurante** — exigiria `tenant_id` e quebra a regra fundadora → produto SEPARADO, não este template.
MVP recomendado se avançar: (a) — `chat_messages(order_id, sender, body, created_at)` + push web. Registar como ADR em `/docs/decisions`.

---

## Disciplina de sessão (colar no início de cada sessão do Claude Code)

```
Estamos na fase <X.Y> do ROADMAP.md. Lê o CLAUDE.md e a fase no ROADMAP.
É single-tenant: zero tenant_id, zero planos. Reaproveita do QR MESAS o que der.
Lista os ficheiros que vais criar/alterar e o plano de testes ANTES de codar.
Não toques em nada fora do escopo da fase. No fim, corre pnpm lint && pnpm test
e mostra-me o resultado + checklist de DoD.
```
</content>
