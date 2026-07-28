#!/usr/bin/env node
// pnpm menu:export [ficheiro.json|ficheiro.csv]
// Exporta a lista de produtos da BD no formato canónico (docs/menu-format.md).
// O ficheiro gerado volta a entrar por `pnpm menu:import` sem perder nada (round-trip).
// Sem argumento → escreve menu-export-AAAA-MM-DD.json na pasta atual.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMenuExport, menuToCsv, rowsFromExportRpc } from '../packages/core/src/menu-export';
// @ts-expect-error — módulo .mjs sem tipos (partilhado com setup-client)
import { parseEnvFile } from './lib/validate-config.mjs';

const c = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

function fail(msg: string): never {
  console.error('\n' + c.red('✖ ' + msg) + '\n');
  process.exit(1);
}

const args = process.argv.slice(2);
const fileArg = args.find((a) => !a.startsWith('--'));
const today = new Date().toISOString().slice(0, 10);
const forceCsv = args.includes('--csv');
const outPath = resolve(
  process.cwd(),
  fileArg ?? `menu-export-${today}.${forceCsv ? 'csv' : 'json'}`,
);
const asCsv = forceCsv || outPath.toLowerCase().endsWith('.csv');

async function run(): Promise<void> {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) fail('Falta .env com NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
  const env = parseEnvFile(readFileSync(envPath, 'utf8'));
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('Falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.');

  const res = await fetch(`${url}/rest/v1/rpc/export_menu`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: '{}',
  });

  if (!res.ok) fail(`Supabase RPC export_menu falhou (${res.status}): ${await res.text()}`);

  const { categories, items } = rowsFromExportRpc(await res.json());
  const menu = buildMenuExport(categories, items);
  const nItems = menu.categories.reduce((s, cat) => s + cat.items.length, 0);

  if (nItems === 0) fail('A loja não tem produtos para exportar.');

  writeFileSync(outPath, asCsv ? menuToCsv(menu) : JSON.stringify(menu, null, 2), 'utf8');

  console.log(c.bold(`\n📋 ${menu.categories.length} categoria(s), ${nItems} produto(s)`));
  for (const cat of menu.categories) {
    console.log('  ' + c.bold(cat.name));
    for (const it of cat.items) {
      const antes = it.compare_at_price ? c.dim(`  (antes ${it.compare_at_price} MT)`) : '';
      console.log(c.dim(`    - ${it.name}  ${it.price} MT`) + antes);
    }
  }
  console.log(c.green('\n✔ Escrito: ') + outPath + '\n');
}

run().catch((e) => fail((e as Error).message));
