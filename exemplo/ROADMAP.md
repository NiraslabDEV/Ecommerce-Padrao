# ROADMAP.md — Mesa QR: Roteiro de Execução em Fases

> **Como usar:** abra o Claude Code na raiz do repo. Cole o PROMPT da fase atual, exatamente como está.
> Uma fase por sessão. A fase só está concluída quando TODO o checklist de DoD estiver verde.
> Nunca avance com testes falhando. Nunca deixe o agente "adiantar" a fase seguinte.

Legenda: 🔴 bloqueia tudo · 🟡 bloqueia o piloto · 🟢 pós-piloto

> **Estado actual (2026-06-11): FASE 1 CONCLUÍDA** ✅ (F1.1 `d52575eb`, F1.2 `743a2974`, F1.3 `65d70df6`, F1.4 `fb122fc6` + fixes `b962b748`/`40752bd8`).
> Pendências para fechar o piloto: (a) teste com impressora física via LAN (F1.1); (b) sandbox real
> da Paysuite — requer conta/API key (F1.3); (c) confirmar CI verde no 1º push ao GitHub.
> Fix crítico incluído: recursão infinita nas policies RLS de `memberships` (migration 0007) que
> bloqueava TODA query autenticada. Migrations 0001–0008 aplicadas em local e produção.
> **Próximo: CHECKPOINT do piloto** — instalar no restaurante, rodar 2 semanas, coletar event_log.

---

## FASE 0 — Fundação (demo funcional sem dinheiro real)

### F0.1 🔴 Esqueleto do monorepo

**PROMPT:**
> Leia o CLAUDE.md (seções 2, 3 e ⚡). Crie o esqueleto do monorepo: pnpm workspaces + Turborepo com `apps/web` (Next.js 14 App Router + TS + Tailwind + shadcn/ui), `packages/core`, `packages/db`, `packages/paysuite`, `services/print-bridge`. Configure Vitest na raiz, ESLint, tsconfig compartilhado e os scripts da seção 10 do CLAUDE.md (os que ainda não funcionam podem apontar para `echo TODO`). Não implemente nenhuma lógica de domínio. Crie um teste trivial em cada package para provar que o Vitest roda em todos.

**DoD:**
- [x] `pnpm install && pnpm lint && pnpm test && pnpm dev` funcionam
- [x] `apps/web` abre página placeholder em localhost:3000
- [x] 1 teste trivial verde por package
- [x] Commit `chore: monorepo skeleton`

### F0.2 🔴 Banco núcleo + RLS

**PROMPT:**
> Leia o CLAUDE.md (seções 4, 12, 13.1, 13.2). Crie em `packages/db/migrations/0001_core.sql`: tabelas `tenants`, `memberships`, `tables`, `menu_categories`, `menu_items` conforme o DDL da seção 4; a função `auth_tenant_id()`; RLS habilitado em TODAS com policies seguindo o template 13.1 (anon sem nenhuma policy); a RPC `get_menu_by_qr` completa seguindo 13.2. Crie `packages/db/seed.sql` com 1 tenant demo (slug `demo`, plano `pro`), 3 mesas, 3 categorias (kitchen, bar, cold_kitchen) e 8 itens com preços em centavos. Crie `packages/db/tests/rls.test.ts` (Vitest, contra Supabase local) provando: (a) anon não lê nenhuma tabela; (b) `get_menu_by_qr` com token válido retorna o menu; (c) token inválido lança erro; (d) usuário do tenant A não lê dados do tenant B.

**DoD:**
- [x] `supabase db reset` aplica migration + seed sem erro
- [x] 4 testes de RLS verdes (exigem Supabase local activo — não rodam no `pnpm test` unitário)
- [x] `pnpm db:types` gera tipos
- [x] Commit `feat(db): core schema with RLS`

### F0.3 🔴 Domínio puro (`packages/core`)

**PROMPT:**
> Leia o CLAUDE.md (seções 5, 1.1, 13.5, ⚡). Em `packages/core`, TESTES PRIMEIRO, implemente: (1) `money.ts` exatamente como 13.5; (2) `plans.ts` com o gating da tabela 1.1 (`canUseFeature(plan, feature): boolean`); (3) `order-machine.ts` com os DOIS fluxos da seção 5 (digital e manual), função `transition(order, event, actor)` que retorna novo estado ou erro tipado `InvalidTransition`. Testes obrigatórios: todas as transições válidas dos dois fluxos; pelo menos 8 transições inválidas (ex.: `draft→in_preparation`, `awaiting_payment→ready`, cliente tentando cancelar); cancelamento só por staff; `payment_failed→awaiting_payment` (retry). Zod schemas dos payloads (`createOrderInput`, `paysuiteWebhook`) em `schemas.ts`.

**DoD:**
- [x] Cobertura de `order-machine.ts` = 100% de branches
- [x] ≥ 25 testes verdes no core (58 testes)
- [x] Zero dependência de Supabase/Next no package
- [x] Commit `feat(core): order state machine, money, plans`

### F0.4 🔴 Fluxo do cliente (QR → carrinho → pedido)

**PROMPT:**
> Leia o CLAUDE.md (seções 3, 4, 13.2, 12). Implemente a rota pública `/r/[slug]/m/[table]?t=<qr_token>` em `apps/web`: valida o token via `get_menu_by_qr`, renderiza cardápio por categoria (fotos, preços com `formatMT`), carrinho client-side (TanStack Query + estado local), tela de revisão e botão "Enviar pedido". Crie a migration `0002_orders.sql`: tabelas `orders`, `order_items`, `event_log` (DDL seção 4, RLS template 13.1, event_log append-only) e a RPC `create_order_by_qr(p_qr_token, p_items jsonb, p_phone)` SECURITY DEFINER que: valida token, valida itens contra `menu_items` (preço do BANCO, nunca do client), cria pedido em `awaiting_payment` (plano pro/premium) ou `awaiting_approval` (starter), grava snapshots e event_log, retorna `order_id`. Teste de integração: pedido criado com preço adulterado no payload → total calculado pelo banco prevalece.

**DoD:**
- [x] Escaneio QR do seed no celular → vejo menu → monto carrinho → pedido criado no banco
- [x] Preço adulterado no client não afeta total (teste verde)
- [x] Mobile-first: usável em tela 360px
- [x] Commit `feat(web): public QR ordering flow`

### F0.5 🔴 Pagamentos mock + webhook + print_jobs

**PROMPT:**
> Leia o CLAUDE.md (seções 6, 13.3, 12). Em `packages/paysuite`: interface `PaymentProvider` (`initiatePush`, `verifyWebhookSignature`, `parseWebhook`) com duas implementações: `MockProvider` (simula push e dispara webhook local após 2s, com helpers para forçar falha/duplicado nos testes) e `PaysuiteProvider` (esqueleto com TODOs, sem chamadas reais ainda). Migration `0003_payments.sql`: `payments` e `print_jobs` (DDL seção 4) + RPC transacional `confirm_payment(p_idempotency_key, ...)` que marca `paid`, cria 1 print_job por estação envolvida e grava event_log — tudo ou nada. Route handler `/api/webhooks/paysuite` seguindo EXATAMENTE o padrão 13.3. Testes: webhook válido confirma e cria print_jobs corretos por estação; duplicado → 200 sem efeito; assinatura inválida → 401; fora de ordem (webhook de pedido inexistente) → 200 + event_log de anomalia.

**DoD:**
- [x] Fluxo completo com `PAYMENT_PROVIDER=mock`: pedido → "pagamento" → `paid` → print_jobs na fila
- [x] 4 cenários de webhook testados e verdes
- [x] Nenhum secret no bundle do client (verificar `next build`)
- [x] Commit `feat(payments): mock provider, idempotent webhook, print jobs`
- [x] *(auditoria `71a42cb2`)* `confirm_payment` valida valor (mismatch → anomalia, fica pending) e estado do pedido (cancelado não ressuscita)

### F0.6 🔴 PWA da cozinha (Realtime + som)

**PROMPT:**
> Leia o CLAUDE.md (seções 7, 9, 12). Implemente `/kitchen` em `apps/web` (auth Supabase, roles kitchen|bar): colunas "Novos / Em preparo / Prontos", subscrição Realtime em `orders` do tenant (status `paid|approved|in_preparation`), card com nº do pedido, MESA em destaque, itens da estação do usuário, tempo decorrido. Som em loop + vibração até o ack "Iniciar preparo" (transições via RPC que usa a state machine do core — nunca update direto). Banner "SEM CONEXÃO" + refetch completo ao reconectar. Manifest PWA + service worker (instalável no tablet Android, fullscreen). Botões mín. 64px, fonte ≥ 18px. Teste e2e Playwright: pedido pago aparece na tela da cozinha em < 2s com o mock provider.

**DoD:**
- [x] Demo de ponta a ponta SEM dinheiro real: QR no celular → pedido → pagar (mock) → tablet apita → "Iniciar preparo" → "Pronto"
- [x] Desligar Wi-Fi do tablet → banner aparece; religar → pedidos ressincronizam
- [x] PWA instalável (Add to Home Screen) e abre fullscreen
- [x] Commit `feat(kitchen): realtime PWA with audio alerts`
- [x] *(auditoria `71a42cb2`)* `advance_order` exige motivo no `CANCEL` (seção 5 do CLAUDE.md)

🎉 **CHECKPOINT: aqui tu já tens a demo para mostrar a restaurantes. Marca reuniões ANTES de continuar.**

---

## FASE 1 — Piloto (dinheiro e papel de verdade)

### F1.1 🟡 Print-bridge

**PROMPT:**
> Leia o CLAUDE.md (seção 7 — Print-bridge). Em `services/print-bridge` (Node + TS): poll de `print_jobs.queued` do tenant a cada 3s, render ESC/POS (lib `esc-pos-encoder` ou similar): nº pedido, MESA em fonte dupla, itens+qty+notas, status de pagamento, hora; envio TCP `ip:9100` conforme `printers` da estação; retry 3× com backoff → `failed` + event_log. Inclua `printer-sim.ts`: servidor TCP local que recebe bytes ESC/POS e imprime no console o cupom decodificado, para `pnpm bridge:dev` funcionar sem hardware. Testes: job → printed; impressora fora → failed após 3 tentativas; 2 estações → 2 impressoras corretas.

**DoD:**
- [x] `pnpm bridge:dev` mostra cupom decodificado no console ao pagar pedido mock
- [ ] Testado com a XPrinter real via LAN (cupom físico sai correto, acentos OK) — pendente de hardware
- [x] Falha de impressão NÃO impede o card no tablet (caminho de impressão é separado do realtime de `orders`; job vira `failed` + event_log, sem tocar no pedido)
- [x] Commit `feat(bridge): ESC/POS print bridge with simulator` (`d52575eb` — inclui filtro `TENANT_ID` no poller)

### F1.2 🟡 Admin do restaurante

**PROMPT:**
> Leia o CLAUDE.md (seções 3, 8, 1.1). Implemente `/admin` (roles owner|manager): CRUD de categorias e itens (upload de foto via Supabase Storage, preço em MT convertido para centavos no submit, toggle `available`); gestão de mesas com geração de QR (página A4 imprimível com QRs + nº da mesa + logo); CRUD de impressoras (nome, IP, estação, botão "testar impressão"); lista de pedidos do dia com status. Gating por plano via `canUseFeature` no servidor.

**DoD:**
- [x] Dono cadastra item com foto e ele aparece no QR do cliente imediatamente (`get_menu_by_qr` devolve `photo_url` — ADR 0001)
- [x] PDF/página de QRs imprimível gerada (`/admin/qr-print`, A4, lib `qrcode`)
- [x] Usuário `kitchen` não acessa /admin (403)
- [x] Commit `feat(admin): menu, tables/QR, printers management` (`743a2974`)

### F1.3 🟡 Paysuite real + reconciliação

**PROMPT:**
> Leia o CLAUDE.md seção 6 (atualizada com o contrato real da Paysuite). Implemente `PaysuiteProvider` seguindo exatamente a interface descrita: `createCheckout` chama `POST /v1/payments` com `amount` decimal, `method` opcional, `return_url`, `webhook_url`, `request_id`. O frontend: ao invés de campo de telefone, redireciona para `checkout_url` (abre em nova aba ou navegação). A página de retorno (`/payment/return`) faz polling do status do pedido a cada 2 segundos até `paid` ou `failed`. Webhook: verificação HMAC-SHA256 do raw body, idempotência via `request_id`, suporte aos eventos `payment.success` e `payment.failed`. Reconciliação: Vercel Cron a cada 5 min verifica pendências > 5 min via `GET /v1/payments/:id`. Testes: mock provider simula redirect e webhook; teste de integração com sandbox da Paysuite (se disponível). Mensagens de erro em português para: `insufficient_balance`, `invalid_phone`, `pin_timeout`, `card_declined`.

**DoD:**
- [ ] Fluxo completo em sandbox: pedido → redirect → cliente "paga" (simulado ou real) → webhook → pedido confirmado na cozinha — **pendente de conta/API key Paysuite** (fluxo equivalente verde com mock no e2e)
- [x] Webhook duplicado com mesmo `request_id` não causa efeito colateral
- [x] Assinatura inválida → 401; retry da Paysuite recebe 2xx sempre (mesmo em duplicado)
- [x] Reconciliação corrige webhook perdido em ≤ 5 min (6 cenários unit; cron `/api/cron/reconcile-payments` com `CRON_SECRET`)
- [x] Cartão de crédito funciona com o mesmo fluxo (método `credit_card`)
- [x] Commit `feat(payments): live Paysuite with redirect, HMAC webhook, reconciliation` (`65d70df6`)

### F1.4 🟡 Hardening do piloto

**PROMPT:**
> Leia o CLAUDE.md (seção 9). Implemente: heartbeat do tablet e do print-bridge (tabela `device_heartbeats`, upsert 60s) com indicador online/offline no admin; rate-limit nas RPCs públicas (por IP+token, ex. 10 pedidos/min/mesa); página de status interno; e2e Playwright do caminho crítico completo com mock provider rodando no CI (GitHub Actions).

**DoD:**
- [x] CI verde com e2e do caminho crítico (2/2 verdes local; workflow `.github/workflows/ci.yml` — confirmar no 1º push ao GitHub)
- [x] Admin mostra cozinha/bridge online/offline em tempo real (tab Estado, heartbeat < 2 min)
- [x] Rate-limit testado (por mesa no Postgres `P0050` + por IP no `/api/payments` 429)
- [x] Commit `feat(ops): heartbeats, rate limiting, CI e2e` (`fb122fc6` — inclui fix crítico: recursão infinita nas policies RLS de `memberships`, migration 0007)

🎉 **CHECKPOINT: instalar no restaurante piloto. Rodar 2 semanas. Coletar TUDO no event_log antes de construir Premium.**

---

## FASE 2 — Premium e escala

### F2.0 🟡 Operação de sala (nome, dinheiro, modo balcão)

**PROMPT:**
> Leia o CLAUDE.md (seções 5, 7 e 14 — Operação de sala). Implemente: (1) **Nome no pedido**: coluna `orders.customer_name`, parâmetro aditivo `p_name` na `create_order_by_qr` (ADR curto), campo "O teu nome" no checkout, nome no card da cozinha e no cupom. (2) **Dinheiro por pedido**: botão "Pagar em dinheiro" no checkout (todos os planos) → pedido nasce `awaiting_approval`; ecrã de aprovação para roles waiter/manager/owner (lista de pendentes + botão "Aprovar" → RPC `advance_order` APPROVE — backend já existe desde a migration 0008). (3) **Modo Balcão**: `tables.type` ('table'|'counter'); pedidos de mesa counter recebem código de levantamento de 3 chars (`orders.pickup_code`, gerado no servidor); página de status do pedido vibra + apita + mostra o código GRANDE quando `ready`; cupom mostra o código em fonte dupla no lugar da mesa. Testes Vitest para geração de código e transições.

**DoD:**
- [x] 4 telemóveis pedem na mesma mesa, cada card da cozinha mostra o nome
- [x] Pedido em dinheiro: aprovar no ecrã do garçom (/approvals) → cozinha + cupom "PAGAR NO BALCÃO"
- [x] Mesa counter: pagar → "Pronto" → /order-status vibra + 3 beeps + código 8xl
- [x] Commit `feat(floor): customer name, cash per order, counter mode` (auditoria: repôs rate-limit P0050 que a reescrita tinha deixado cair; RPCs get_order_status/get_menu_by_qr ganharam os campos que a UI esperava)

### F2.1 🟢 Dashboard gerencial

**PROMPT:**
> Leia o CLAUDE.md (seção 8.2). Migration com views de métricas (faturamento, ticket médio, top itens, divisão por método, tempo médio pago→entregue, heatmap por hora) e página `/admin/dashboard` (Recharts) com filtros dia/semana/mês. Gating Premium no servidor. Teste: views retornam valores corretos contra seed conhecido.

**DoD:** [x] métricas batem com seed (19 testes) · [x] starter/pro recebem upsell + P0030 no servidor · [x] commit `d76e2e7` (inclui fix: `avg_time_minutes` usava evento inexistente)

### F2.2 🟢 Estoque

**PROMPT:**
> Leia o CLAUDE.md (seções 8.1, 13.4). Implemente dedução atômica no `confirm_payment`/aprovação seguindo EXATAMENTE 13.4, trigger `stock_qty=0 → available=false`, UI de estoque no admin (ajustes manuais com motivo, logados). Testes: pedido com item esgotado → rollback TOTAL; 2 pedidos concorrentes disputando último item → só 1 confirma.

**DoD:** [ ] teste de concorrência verde · [ ] rollback total verde · [ ] commit

### F2.3 🟢 Fidelidade

**PROMPT:**
> Leia o CLAUDE.md (seção 8.3). Migration das 3 tabelas loyalty, earn no confirm_payment (mesma transação), redeem no checkout com validação atômica de saldo de pontos, UI: campo telefone no checkout + saldo visível + botão resgatar. Testes: earn correto; redeem sem saldo → erro; redeem concorrente não gera saldo negativo.

**DoD:** [ ] 3 testes verdes · [ ] fluxo completo no celular · [ ] commit

### F2.4 🟢 Onboarding self-service + billing

**PROMPT:**
> Leia o CLAUDE.md (seções 1.1, 4). Fluxo de cadastro de novo restaurante (cria tenant, membership owner, wizard: dados → cardápio inicial → mesas → plano), cobrança da mensalidade (MVP: manual/transferência com marcação no admin interno; automatizar depois), painel super-admin (teu) para gerir tenants. ADR antes de implementar o super-admin (modelo de permissão).

**DoD:** [ ] novo restaurante operacional em < 30 min sem tua intervenção técnica · [ ] commit

### F2.5 🟡 Pagamentos self-service (chaves Paysuite por tenant)

**PROMPT:**
> Leia o CLAUDE.md (seção 6.8 — Pagamentos por tenant). Implemente: colunas `tenants.paysuite_api_key_enc` e `paysuite_webhook_secret_enc` (encriptadas com pgsodium/pgcrypto, chave-mestra `PAYMENT_KEYS_MASTER_KEY` no servidor — NUNCA em claro nem no client); tab "Pagamentos" no /admin (owner only): inputs das 2 chaves, Webhook URL pronto a copiar com instruções, botão "Testar ligação" (GET à Paysuite via route handler, devolve ✅/❌); o webhook handler torna-se multi-tenant: localiza o pagamento pelo `reference` → tenant → desencripta o secret DESSE tenant → valida HMAC; `/api/payments` usa as chaves do tenant do pedido (fallback para env vars = tenant da casa). Testes: 2 tenants com secrets diferentes, webhook assinado com secret errado → 401.

**DoD:**
- [ ] Dono cola as chaves no admin e recebe pagamentos na conta Paysuite DELE
- [ ] Chaves ilegíveis na BD (verificar com select directo)
- [ ] Webhook de tenant A não valida com secret do tenant B (teste)
- [ ] Commit `feat(payments): per-tenant Paysuite keys, self-service`

### F2.6 🟢 Dividir a conta (split)

**PROMPT:**
> Leia o CLAUDE.md (seção 14.2 — Split). No ecrã de revisão, botão "Dividir conta": por N partes iguais ou por item (atribuir itens a pessoas, cada uma com nome + número + método). Gera N registos em `payments` (parciais, soma = total). Parcelas digitais: `checkout_url` da Paysuite, entregue por pessoa com 4 opções — WhatsApp (`wa.me/<numero>?text=...`, deep link, NUNCA a Business API), SMS (`sms:...?body=...`), "Mostrar QR" (amigo scaneia o ecrã de quem pediu) e "Copiar link"; em tablet partilhado, N QRs directos. Parcela em DINHEIRO: nasce `pending` `method='cash'` → garçom toca "Recebido" no ecrã de aprovação → conta para a soma. Ecrã de progresso ao vivo: ✅/⏳/💵/❌ por pessoa + "Reenviar" na falhada (retry isolado). `confirm_payment` confirma o PEDIDO apenas quando `sum(confirmed) >= orders.total_cents`; event_log por parcela. NOTA: Paysuite sem push directo por msisdn (verificado 2026-06-12) — se o suporte confirmar direct charge, trocar WhatsApp/SMS pelo push real sem mudar o resto. Testes: 3 parcelas (2 digitais + 1 cash), pedido só vai à cozinha quando a última fechar; parcela falhada não bloqueia as outras.

**DoD:** [ ] 2 telemóveis pagam via link + 1 pessoa paga cash ao garçom e a cozinha recebe 1 pedido · [ ] parcela falhada → "Reenviar" só daquela · [ ] progresso ao vivo no telemóvel de quem pediu · [ ] commit

### F2.7 🟢 Recibo fiscal (VD Moçambique)

**PROMPT:**
> ⚠️ PRÉ-REQUISITO: validar com contabilista moçambicano o regime fiscal dos clientes-piloto (IVA 16%, exigência de software certificado AT). Depois: campos fiscais no tenant (NUIT, endereço, regime IVA), numeração sequencial `vd_number` por tenant (atómica), template do talão VD: nome+NUIT+endereço, "VD nº X/ANO", data/hora, itens (qty × preço unitário), IVA discriminado, total, "Processado por computador". Botão "Emitir VD" no admin/garçom por pedido entregue.

**DoD:** [ ] template validado pelo contabilista · [ ] numeração sequencial sem buracos (teste concorrência) · [ ] commit

### F2.8 🟢 Modo Convivência (integração com sistemas existentes)

**PROMPT:**
> Leia o CLAUDE.md (seção 14.3). Implemente: exportação CSV/Excel no admin (vendas do período: data, pedido, itens, método, total, IVA) para lançamento no sistema legado; webhooks de saída configuráveis por tenant (`tenant_webhooks`: URL + secret + eventos subscritos; despachados a partir do event_log com retry/backoff); importação de cardápio por CSV (template fornecido) e por FOTO do menu antigo (IA extrai categorias/itens/preços → ecrã de revisão antes de gravar).

**DoD:** [ ] CSV abre no Excel com totais correctos · [ ] webhook de saída entregue com assinatura · [ ] foto de menu → cardápio importado em < 5 min · [ ] commit

### F2.9 🟡 Fecho de caixa

**PROMPT:**
> Leia o CLAUDE.md (seção 14.4 — Fecho de caixa). Migration: tabela `cash_sessions` (tenant_id, opened_at/by, closed_at/by, expected_cash_cents, counted_cash_cents, difference_cents, notes, report jsonb) + RPCs `open_cash_session()` e `close_cash_session(p_counted_cents, p_notes)` (owner|manager; SECURITY DEFINER; fecho calcula expected a partir de payments confirmed `method='cash'` da sessão, congela snapshot imutável em `report`, grava event_log). Admin → tab "Caixa": painel ao vivo (totais por método, nº pedidos, cancelados com motivo), botão "Fechar caixa" com fluxo contar→digitar→diferença→notas→confirmar, histórico de fechos com diferenças destacadas. Cupom Z na térmica via print_jobs (resumo: período, totais por método, pedidos, cancelados, diferença, linha de assinatura). Regras: pedido conta na sessão em que foi PAGO; fecho imutável (correcção = nota no fecho seguinte). Testes: expected correcto com mix digital+cash; fecho não inclui pedidos da sessão seguinte; report imutável.

**DoD:**
- [ ] Dia com M-Pesa + dinheiro: "Fechar caixa" mostra o esperado certo e regista a diferença contada
- [ ] Cupom Z imprime com totais por método e linha de assinatura
- [ ] Fecho de ontem não muda quando entram pedidos hoje (imutável)
- [ ] Commit `feat(cash): cash session close with Z-report`

---

## FASE 3 — Expansão (ideias validadas, não especificadas)

- **F3.1 Delivery**: pedidos fora do restaurante (morada/zona de entrega, taxa, estado "em entrega", integração WhatsApp para o estafeta). Especificar só depois do piloto.
- **F3.2 Sites vitrine integrados**: ver `docs/SITES-RESTAURANTE.md` (FS.1–FS.3) — site bonito por cliente usando o Mesa QR como backend.
- **F3.3 Painel TV "Pedidos Prontos"**: página fullscreen com códigos de levantamento (complementa o Modo Balcão da F2.0).

---

## Disciplina de sessão (cola isto no início de cada sessão do Claude Code)

```
Estamos na fase <X.Y> do ROADMAP.md. Leia CLAUDE.md e a fase no ROADMAP.
Liste os arquivos que vai criar/alterar e o plano de testes ANTES de codar.
Não toque em nada fora do escopo da fase. Ao final, rode pnpm lint && pnpm test
e me mostre o resultado + checklist de DoD.
```
