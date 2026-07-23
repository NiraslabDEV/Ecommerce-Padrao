# CLAUDE.md — HAWSMASH

Restaurante de smash burgers em Maputo, Moçambique.
Site de encomendas online com checkout, admin e Edge Functions Supabase.
Desenvolvido por **Niraslab** (niraslab.dev@gmail.com).

---

## 1. TOPOLOGIA DE DEPLOY

| Ambiente | URL | Branch git | Railway service |
|---|---|---|---|
| **LIVE** | `hawsmash.com` | `main` | hawsmash-production |
| **STAGING** | `hawsmash-staging-vite.up.railway.app` | `vite-build` | hawsmash-staging-vite |
| ~~Morto~~ | `hawsmash.up.railway.app` | — | abandonado (404 em tudo) |

Railway auto-deploya em cada `git push` (~45s-1min). Não há CI manual.

### REGRA DE OURO — NUNCA VIOLAR
```
editar código → push para vite-build → testar staging → merge para main → live
NUNCA editar main diretamente. NUNCA testar features só em local.
```

### Backend Supabase — PARTILHADO
O projeto Supabase `tsrgileifpiaiicwjfar` ("hawsmash") é **único e partilhado** entre staging e live.
Qualquer ALTER TABLE, INSERT, policy change, bucket change, Edge Function deploy **vai a produção imediatamente**.
Não existe Supabase de staging. Pensar duas vezes antes de qualquer mudança de DB.

---

## 2. STACK E BUILD

- **Frontend**: React 18 + Vite 5, Multi-Page App (MPA)
- **Runtime deploy**: `npx serve dist` (pacote `serve` v14), servido pelo Railway
- **Build**: `npm run build` → executa `node scripts/build.mjs` → `vite build`
- **Dev local**: `npm run dev` → Vite dev server

### Entrypoints Vite (`vite.config.js`)
```
index.html    → src/app.jsx       (homepage + menu + carrinho)
checkout.html → src/checkout.jsx  (checkout, pagamento M-Pesa/e-Mola, upload comprovativo)
admin.html    → src/admin.jsx     (painel admin — protegido por Supabase Auth)
```

### Ficheiros CSS
- `checkout.css` (raiz) — estilos do checkout, **importado por `src/checkout.jsx`**, NÃO inline no HTML
- `public/styles.css` — estilos do admin (referenciado por `admin.html` via `<link>`)
- `index.html` e `checkout.html` não têm `<style>` inline — foi removido para corrigir race do build

### Config runtime (inline scripts nos HTML)
Cada página HTML tem um `<script>` inline que define `window.*`:
- `checkout.html`: SUPABASE_URL, SUPABASE_ANON_KEY, EMOLA_NUMBER/NAME, MPESA_NUMBER/NAME, PICKUP_ADDRESS, DELIVERY_FEE_MT
- `admin.html`: SUPABASE_URL, SUPABASE_ANON_KEY
- `index.html`: PRE_LAUNCH (false=aceita pedidos; true=lista de espera)

A anon key (`sb_publishable_6FKwR_eCIKN6kngjb04Vbg_p7Couoay`) é **pública e intencional** — protegida por RLS. Não é um segredo a remover.

### Configuração de servidor (`public/serve.json`)
Rewrites para URLs sem extensão + headers de segurança:
```
/checkout → /checkout.html
/admin    → /admin.html
/         → /index.html
```
Headers: X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy.
**CSP ainda não implementado** — ver secção 6.

---

## 3. SUPABASE — TABELAS, RLS E SEGREDOS

### Tabelas (todas com RLS ligado)
| Tabela | Quem escreve | Quem lê |
|---|---|---|
| `orders` | Edge Function `create-order` (service key) | `authenticated` (admin) |
| `order_items` | Edge Function `create-order` (service key) | `authenticated` (admin) |
| `order_feedback` | anon INSERT (sem rate-limit ⚠️) | `authenticated` |
| `waitlist` | anon INSERT (sem rate-limit ⚠️) | `authenticated` |
| `caixa_fechamentos` | `authenticated` | `authenticated` |

### Funções SQL (SECURITY DEFINER)
- `get_order_number()` — gera número sequencial de pedido; executável por anon ⚠️
- `total_burgers_sold()` — stat público; executável por anon (provavelmente OK, mas rever)
- `set_updated_at()` — trigger de updated_at (OK)
- Todas têm `search_path=''` configurado.

### Storage
- Bucket `payment-proofs` — **PRIVADO** (public=false)
  - Só `authenticated` tem SELECT
  - Admin usa `createSignedUrl(path, 3600)` para ver provas — ver `signProof()` em `src/admin.jsx`
  - `send-email` Edge Function usa service key para download direto
  - **NUNCA usar URL pública do bucket** — vai retornar 400

### Segredos Supabase (painel → Edge Functions → Secrets)
- `SUPABASE_SERVICE_ROLE_KEY` — **NUNCA commitar no código**
- `SMTP_PASS` — password do email transacional
- `SUPABASE_URL` e `SUPABASE_ANON_KEY` são injectados automaticamente

---

## 4. EDGE FUNCTIONS — ESTADO ACTUAL

Projeto Supabase: `tsrgileifpiaiicwjfar`. Todas com `verify_jwt: false`.

| Função | Versionada localmente | Rate-limit |
|---|---|---|
| `create-order` | ✅ `supabase/functions/create-order/index.ts` | ✅ 6/phone/hora |
| `send-email` | ❌ só documentada no README | ❌ |
| `approve-order` | ❌ | ❌ |
| `feedback-email` | ❌ | ❌ |
| `send-apology` | ❌ | ❌ |
| `weekly-report` | ❌ | ❌ |
| `send-caixa` | ❌ | ❌ |
| `review-blast` | ❌ | ❌ |

### ⭐ TAREFA PRIORITÁRIA: Versionar as 7 Edge Functions restantes

**Passo 1 — Puxar do Supabase para o repo local:**
```bash
supabase functions download send-email approve-order feedback-email send-apology weekly-report send-caixa review-blast --project-ref tsrgileifpiaiicwjfar
```
Isto cria `supabase/functions/<nome>/index.ts` para cada uma.

**Passo 2 — Depois de versionar, adicionar rate-limit a `send-email`:**
O padrão a seguir é o de `create-order`. A função `send-email` é chamada pelo admin ou por outras funções, não diretamente pelo cliente — avaliar se rate-limit faz sentido aqui ou se basta proteger `order_feedback` e `waitlist` ao nível do DB.

**Passo 3 — Rate-limit para `order_feedback` e `waitlist` (INSERT anon):**
Opções: policy RLS com count, ou trigger, ou verificação na Edge Function se houver uma.
Sugestão: política RLS que verifica se o mesmo IP/phone submeteu nos últimos X minutos.

**Passo 4 — Fazer deploy das versões actualizadas:**
```bash
supabase functions deploy send-email --project-ref tsrgileifpiaiicwjfar
# (repetir para cada função modificada)
```

**Nota importante:** editar Edge Functions aqui vai a produção. Não há staging para Edge Functions.
Testar a lógica com uma função de teste separada se necessário.

---

## 5. SECURITY DEFINER FUNCTIONS — TAREFA PRIORITÁRIA

**Problema:** `get_order_number` e `total_burgers_sold` são SECURITY DEFINER e executáveis por `anon` e `PUBLIC`.

**`get_order_number`** — gera o número do pedido (ex: "HAW-0042"). Deve ser chamada APENAS pelo trigger interno ou pela `create-order` via service key. Exposta a anon = risco de enumeração + chamadas gratuitas de uma função privilegiada.

**`total_burgers_sold`** — stat de marketing (total de burgers vendidos). Provavelmente OK ser pública, mas deve ser explícito.

**Migration SQL a aplicar** (`supabase` MCP tool → `apply_migration`):
```sql
-- Revogar acesso anon a get_order_number (deve ser chamada só internamente)
REVOKE EXECUTE ON FUNCTION public.get_order_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_order_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_number() TO service_role;

-- total_burgers_sold — se for stat público, manter; senão:
-- REVOKE EXECUTE ON FUNCTION public.total_burgers_sold() FROM anon;

-- pg_net está no schema public — avaliar se deve ser movido (baixo risco, mas não é best practice)
```

**Verificar antes de aplicar:** confirmar se `get_order_number` é chamada por trigger (então precisa de `GRANT TO postgres` também) ou só pela Edge Function (então só service_role chega).

Para verificar:
```sql
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_order_number';
SELECT * FROM information_schema.triggers WHERE event_object_table = 'orders';
```

---

## 6. CSP (Content Security Policy) — TAREFA FUTURA

**Estado:** não implementado. Os 5 headers actuais (serve.json) cobrem o essencial mas não têm CSP.

**Bloqueador actual:** os 3 HTML têm `<script>` inline com `window.*` config. CSP com `script-src 'self'` sem `'unsafe-inline'` bloqueia esses scripts.

**Solução recomendada (extrair config para ficheiros externos):**

1. Criar `public/boot-main.js`:
   ```js
   window.PRE_LAUNCH = false;
   ```

2. Criar `public/boot-checkout.js`:
   ```js
   window.SUPABASE_URL = 'https://tsrgileifpiaiicwjfar.supabase.co';
   window.SUPABASE_ANON_KEY = 'sb_publishable_6FKwR_eCIKN6kngjb04Vbg_p7Couoay';
   window.EMOLA_NUMBER = '870909080';
   window.EMOLA_NAME = 'Mehzabin Ibrahim';
   window.MPESA_NUMBER = '847955382';
   window.MPESA_NAME = 'Soeil Nissar';
   window.PICKUP_ADDRESS = 'Casa do Bom Pasteleiro · Av. 24 de Julho, Maputo';
   window.PICKUP_MAPS = 'https://www.google.com/maps/search/?api=1&query=2HFR%2BFM6+Maputo';
   window.DELIVERY_FEE_MT = 150;
   ```

3. Criar `public/boot-admin.js`:
   ```js
   window.SUPABASE_URL = 'https://tsrgileifpiaiicwjfar.supabase.co';
   window.SUPABASE_ANON_KEY = 'sb_publishable_6FKwR_eCIKN6kngjb04Vbg_p7Couoay';
   ```

4. Substituir os `<script>` inline nos HTML por `<script src="/boot-*.js"></script>`.

5. Adicionar ao `serve.json`:
   ```json
   {
     "key": "Content-Security-Policy",
     "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://tsrgileifpiaiicwjfar.supabase.co; connect-src 'self' https://tsrgileifpiaiicwjfar.supabase.co https://*.supabase.co; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
   }
   ```

**`'unsafe-inline'` em style-src** vai provavelmente ser necessário para os estilos injectados pelo React/Vite — testar no staging antes de subir para live.

**Testar com:** `curl -I https://hawsmash-staging-vite.up.railway.app/` e verificar header CSP. Depois abrir o browser com DevTools → Console para ver violações.

---

## 7. PAGAMENTOS

| Operadora | Número | Nome | Estado |
|---|---|---|---|
| e-Mola | 870909080 | Mehzabin Ibrahim | ✅ activo |
| M-Pesa | 847955382 | Soeil Nissar | ✅ activo |

O campo `payment_method` na tabela `orders` armazena `'emola'` ou `'mpesa'`.
O `create-order` valida: se não for um destes, faz default para `'emola'` (retrocompatibilidade).

---

## 8. ASSETS E IMAGENS

Todos os assets em `public/assets/` — formato WebP preferido.

| Ficheiro | Tamanho | Notas |
|---|---|---|
| `delivery.webp` | ~105KB | Imagem de delivery no hero |
| `logo-emola.webp` | ~4KB | Logo e-Mola no checkout |
| `logo-mpesa.webp` | ~4KB | Logo M-Pesa no checkout |

---

## 9. PREÇOS (fonte de verdade: `create-order/index.ts`)

```
Classic Smash HAW: 300 MT     Classic Smash WAGYU: 400 MT
Double Smash HAW: 400 MT      Double Smash WAGYU: 500 MT
Smoked Brisket HAW: 450 MT    Smoked Brisket WAGYU: 500 MT
Hawsmash Signature: 600 MT
Pastéis de Nata (1): 90 MT    Pastéis de Nata (6): 500 MT
Joe's Chips: 150 MT
Taxa de entrega: 150 MT
```

**Os preços SÓ existem no servidor (`create-order`).** O cliente envia nomes e quantidades; o servidor recalcula tudo. Nunca confiar nos preços do lado do cliente.

---

## 10. WORKFLOW RECOMENDADO PARA QUALQUER TAREFA

1. Perguntar: "isto afecta DB/storage/Edge Functions?" → se sim, vai a produção imediatamente
2. Fazer a mudança em `vite-build`
3. `git push origin vite-build` → esperar deploy staging (~45s)
4. Testar em `hawsmash-staging-vite.up.railway.app`
5. Se OK: `git checkout main && git merge vite-build && git push origin main`
6. Confirmar em `hawsmash.com`

Para Edge Functions: não há staging — deploy vai direto para produção. Testar lógica localmente com `supabase functions serve` se possível.

---

## 11. COMANDOS ÚTEIS

```bash
# Desenvolvimento local
npm run dev

# Build local (igual ao Railway)
npm run build

# Servir build local (igual ao Railway)
npx serve dist -l 3000

# Puxar Edge Functions do Supabase (versionar)
supabase functions download <nome> --project-ref tsrgileifpiaiicwjfar

# Deploy Edge Function
supabase functions deploy <nome> --project-ref tsrgileifpiaiicwjfar

# Ver logs Edge Function (últimas 100 linhas)
supabase functions logs <nome> --project-ref tsrgileifpiaiicwjfar
```

---

## 12. O QUE NÃO FAZER

- ❌ NUNCA commitar `SUPABASE_SERVICE_ROLE_KEY` no código
- ❌ NUNCA usar URL pública do bucket `payment-proofs` — é privado, dá 400
- ❌ NUNCA fazer `window.PRE_LAUNCH = true` sem avisar o dono — bloqueia todas as encomendas
- ❌ NUNCA editar `main` diretamente sem testar no staging
- ❌ NUNCA adicionar `<style>` inline grande num ficheiro HTML — causa race no build Vite (bug resolvido em checkout.html, manter resolvido)
- ❌ NUNCA alterar os preços no frontend — só em `supabase/functions/create-order/index.ts`
