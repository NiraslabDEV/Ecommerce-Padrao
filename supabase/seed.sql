-- Seed demo para o Ecommerce-Padrão / Delivery OS (pnpm db:seed / supabase db reset)
-- Boutique "LUMA" (moda & perfumaria) em Maputo, Moçambique.
-- Dinheiro sempre em CENTAVOS inteiros (MZN). photo_url dos produtos = NULL
-- (a loja tem fallback elegante para itens sem foto — brand.ts storefront.fallbackImages).
--
-- Idempotente no mesmo espírito do seed anterior: entidades com id fixo usam
-- "on conflict (id) do nothing"; filhos (variantes/adicionais/zonas) usam
-- "on conflict do nothing" e são pensados para correr sobre um `supabase db reset` limpo.

do $$
declare
  -- Categorias (uuid fixo para referência estável nas FKs)
  c_fem  uuid := 'a0000000-0000-4000-8000-000000000001';
  c_masc uuid := 'a0000000-0000-4000-8000-000000000002';
  c_perf uuid := 'a0000000-0000-4000-8000-000000000003';
  c_aces uuid := 'a0000000-0000-4000-8000-000000000004';

  -- Itens — Roupa Feminina
  i_vestido   uuid := 'b0000000-0000-4000-8000-000000000001';
  i_blusa     uuid := 'b0000000-0000-4000-8000-000000000002';
  i_calca_alf uuid := 'b0000000-0000-4000-8000-000000000003';
  i_saia      uuid := 'b0000000-0000-4000-8000-000000000004';

  -- Itens — Roupa Masculina
  i_camisa    uuid := 'b0000000-0000-4000-8000-000000000005';
  i_polo      uuid := 'b0000000-0000-4000-8000-000000000006';
  i_chino     uuid := 'b0000000-0000-4000-8000-000000000007';
  i_blazer    uuid := 'b0000000-0000-4000-8000-000000000008';

  -- Itens — Perfumaria
  i_edp_ambar  uuid := 'b0000000-0000-4000-8000-000000000009';
  i_edp_floral uuid := 'b0000000-0000-4000-8000-000000000010';
  i_bodymist   uuid := 'b0000000-0000-4000-8000-000000000011';
  i_kit_mini   uuid := 'b0000000-0000-4000-8000-000000000012';

  -- Itens — Acessórios
  i_bolsa  uuid := 'b0000000-0000-4000-8000-000000000013';
  i_lenco  uuid := 'b0000000-0000-4000-8000-000000000014';
  i_oculos uuid := 'b0000000-0000-4000-8000-000000000015';
  i_cinto  uuid := 'b0000000-0000-4000-8000-000000000016';
begin

  -- ── Settings (singleton) ────────────────────────────────────────────────────
  -- Não existe coluna "nome da loja" no schema (a marca vive em config/brand.ts);
  -- mpesa_name / emola_name funcionam como nome do beneficiário do pagamento.
  insert into settings (
    id, mpesa_number, mpesa_name, emola_number, emola_name,
    pickup_address, pickup_maps_url, owner_email,
    open_hour, close_hour, slot_minutes,
    accepting_orders, payment_provider
  ) values (
    1,
    '84 000 0000', 'LUMA',
    '86 000 0000', 'LUMA',
    'Av. Julius Nyerere, 780, Polana, Maputo',
    'https://maps.google.com/?q=-25.9585,32.5960',
    'contacto@luma.co.mz',
    9, 20, 30,
    true, 'manual'
  ) on conflict (id) do update set
    mpesa_name       = excluded.mpesa_name,
    emola_name       = excluded.emola_name,
    pickup_address   = excluded.pickup_address,
    accepting_orders = excluded.accepting_orders,
    payment_provider = excluded.payment_provider;

  -- ── Categorias ──────────────────────────────────────────────────────────────
  -- station tem CHECK (kitchen|bar|cold_kitchen); numa loja de moda é irrelevante,
  -- por isso usamos 'kitchen' só para satisfazer a constraint.
  insert into menu_categories (id, name, station, sort) values
    (c_fem,  'Roupa Feminina',  'kitchen', 1),
    (c_masc, 'Roupa Masculina', 'kitchen', 2),
    (c_perf, 'Perfumaria',      'kitchen', 3),
    (c_aces, 'Acessórios',      'kitchen', 4)
  on conflict (id) do nothing;

  -- ── Produtos (16 itens, price_cents em centavos MZN, photo_url = NULL) ───────
  insert into menu_items (id, category_id, name, description, price_cents, photo_url, available, sort) values
    -- Roupa Feminina
    (i_vestido,   c_fem,  'Vestido Midi de Linho',       'Corte fluido em linho natural, ideal para o calor de Maputo. Alças ajustáveis e cós marcado.', 320000, null, true, 1),
    (i_blusa,     c_fem,  'Blusa de Seda Off-White',     'Toque leve e caimento impecável, do escritório ao jantar.',                                     185000, null, true, 2),
    (i_calca_alf, c_fem,  'Calça de Alfaiataria',        'Modelagem reta com pregas frontais e tecido encorpado antirrugas.',                             240000, null, true, 3),
    (i_saia,      c_fem,  'Saia Plissada Midi',          'Movimento elegante em plissado permanente e cintura alta.',                                     195000, null, true, 4),
    -- Roupa Masculina
    (i_camisa,    c_masc, 'Camisa Social Slim',          'Algodão de trama fina, gola italiana e corte ajustado.',                                        220000, null, true, 1),
    (i_polo,      c_masc, 'Polo Piqué Premium',          'Malha piqué respirável com acabamento mercerizado.',                                            145000, null, true, 2),
    (i_chino,     c_masc, 'Calça Chino',                 'Sarja de algodão com leve elasticidade e caimento moderno.',                                    210000, null, true, 3),
    (i_blazer,    c_masc, 'Blazer Casual Desestruturado','Sem forro, leve e versátil para o clima tropical.',                                             420000, null, true, 4),
    -- Perfumaria
    (i_edp_ambar,  c_perf, 'Eau de Parfum Âmbar Noturno 100ml', 'Fragrância amadeirada e quente com notas de âmbar, baunilha e sândalo.',                 380000, null, true, 1),
    (i_edp_floral, c_perf, 'Perfume Floral Jardim de Maputo 50ml', 'Buquê de jasmim e frésia sobre fundo suave de almíscar.',                             260000, null, true, 2),
    (i_bodymist,   c_perf, 'Body Mist Cítrico 250ml',    'Bruma refrescante de bergamota e capim-limão para o dia a dia.',                                 95000, null, true, 3),
    (i_kit_mini,   c_perf, 'Kit Miniaturas Descoberta',  'Cinco fragrâncias autorais em formato viagem, na caixa-presente.',                              150000, null, true, 4),
    -- Acessórios
    (i_bolsa,  c_aces, 'Bolsa Tote em Couro',        'Couro legítimo com alças reforçadas e forro interno em algodão.',                                   350000, null, true, 1),
    (i_lenco,  c_aces, 'Lenço de Seda Estampado',    'Estampa exclusiva inspirada nas capulanas, 90x90cm.',                                               120000, null, true, 2),
    (i_oculos, c_aces, 'Óculos de Sol Acetato',      'Armação em acetato com lentes polarizadas UV400.',                                                  280000, null, true, 3),
    (i_cinto,  c_aces, 'Cinto de Couro Trançado',    'Couro trançado à mão com fivela em metal escovado.',                                                110000, null, true, 4)
  on conflict (id) do nothing;

  -- ── Variantes de tamanho (só ROUPA) ─────────────────────────────────────────
  -- price_cents da variante é ABSOLUTO (o create_order substitui o preço base
  -- pelo da variante). Aqui todos os tamanhos custam o preço base do item;
  -- is_default = true no tamanho M.
  insert into menu_item_variants (menu_item_id, name, price_cents, sort, is_default) values
    -- Vestido Midi de Linho (320000)
    (i_vestido, 'P', 320000, 1, false), (i_vestido, 'M', 320000, 2, true), (i_vestido, 'G', 320000, 3, false), (i_vestido, 'GG', 320000, 4, false),
    -- Blusa de Seda (185000)
    (i_blusa, 'P', 185000, 1, false), (i_blusa, 'M', 185000, 2, true), (i_blusa, 'G', 185000, 3, false), (i_blusa, 'GG', 185000, 4, false),
    -- Calça de Alfaiataria (240000)
    (i_calca_alf, 'P', 240000, 1, false), (i_calca_alf, 'M', 240000, 2, true), (i_calca_alf, 'G', 240000, 3, false), (i_calca_alf, 'GG', 240000, 4, false),
    -- Saia Plissada (195000)
    (i_saia, 'P', 195000, 1, false), (i_saia, 'M', 195000, 2, true), (i_saia, 'G', 195000, 3, false), (i_saia, 'GG', 195000, 4, false),
    -- Camisa Social Slim (220000)
    (i_camisa, 'P', 220000, 1, false), (i_camisa, 'M', 220000, 2, true), (i_camisa, 'G', 220000, 3, false), (i_camisa, 'GG', 220000, 4, false),
    -- Polo Piqué Premium (145000)
    (i_polo, 'P', 145000, 1, false), (i_polo, 'M', 145000, 2, true), (i_polo, 'G', 145000, 3, false), (i_polo, 'GG', 145000, 4, false),
    -- Calça Chino (210000)
    (i_chino, 'P', 210000, 1, false), (i_chino, 'M', 210000, 2, true), (i_chino, 'G', 210000, 3, false), (i_chino, 'GG', 210000, 4, false),
    -- Blazer Casual (420000)
    (i_blazer, 'P', 420000, 1, false), (i_blazer, 'M', 420000, 2, true), (i_blazer, 'G', 420000, 3, false), (i_blazer, 'GG', 420000, 4, false)
  on conflict do nothing;

  -- ── Adicionais / upsell (2-3 itens) ─────────────────────────────────────────
  -- price_cents do adicional é um DELTA somado ao preço unitário.
  insert into menu_addons (menu_item_id, name, price_cents, sort) values
    (i_edp_ambar, 'Embrulho para presente', 15000, 1),
    (i_edp_ambar, 'Amostra grátis 2ml',         0, 2),
    (i_vestido,   'Embrulho para presente', 15000, 1),
    (i_bolsa,     'Embrulho para presente', 15000, 1)
  on conflict do nothing;

  -- ── Zonas de entrega (bairros de Maputo, fee_cents em centavos) ─────────────
  insert into delivery_zones (name, fee_cents, sort) values
    ('Polana',        20000, 1),
    ('Sommerschield', 25000, 2),
    ('Baixa',         30000, 3)
  on conflict do nothing;

end $$;
