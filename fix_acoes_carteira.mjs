// Correção pontual das ações que não acompanharam a troca de carteira.
//   1. Reatribui toda ação ABERTA para o dono atual do cliente (concluídas ficam intactas —
//      são histórico de quem executou).
//   2. Apaga os resgates automáticos duplicados que o robô criou desde 21/07, quando o
//      dedup por grupo passou a comparar chave numérica (crm_acoes) com texto zero-padded
//      (crm_clientes) e nunca mais achou a ação anterior.
//
// Rodar: node fix_acoes_carteira.mjs          → só relatório (dry-run)
//        node fix_acoes_carteira.mjs --apply  → aplica
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

try {
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
      process.env[match[1].trim()] = val;
    }
  });
} catch (e) {}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

const pageAll = async (table, cols, tweak = q => q) => {
  const out = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await tweak(supabase.from(table).select(cols)).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
};

const chave = (cod, loja) =>
  `${String(cod ?? '').trim().padStart(6, '0')}_${String(loja ?? '').trim().padStart(2, '0')}`;
const ABERTAS = ['PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA'];

async function run() {
  console.log(APPLY ? '>>> MODO APLICAR <<<\n' : '>>> DRY-RUN (nada será gravado) <<<\n');

  const clientes = await pageAll('crm_clientes', 'CODIGO_CLIENTE, LOJA_CLIENTE, CNPJ_RAIZ, VENDEDOR_RESP, NOME_VENDEDOR_RESP');
  const dono = new Map();
  const grupo = new Map();
  for (const c of clientes) {
    const k = chave(c.CODIGO_CLIENTE, c.LOJA_CLIENTE);
    grupo.set(k, c.CNPJ_RAIZ || k);
    if (c.VENDEDOR_RESP) dono.set(k, { cod: String(c.VENDEDOR_RESP).trim(), nome: c.NOME_VENDEDOR_RESP });
  }

  const abertas = await pageAll('crm_acoes',
    'id, tipo, status, origem, vendedor_responsavel, nome_vendedor, codigo_cliente, loja_cliente, created_at',
    q => q.in('status', ABERTAS));

  // ---------- 1) Reatribuição ----------
  const porDestino = new Map();
  const porOrigem = new Map();
  for (const a of abertas) {
    if (a.codigo_cliente == null) continue;
    const d = dono.get(chave(a.codigo_cliente, a.loja_cliente));
    if (!d) continue;
    if (d.cod === String(a.vendedor_responsavel ?? '').trim()) continue;
    if (!porDestino.has(d.cod)) porDestino.set(d.cod, { ...d, ids: [] });
    porDestino.get(d.cod).ids.push(a.id);
    const k = `${a.vendedor_responsavel} (${a.nome_vendedor}) → ${d.cod} (${d.nome}) [${a.origem}/${a.status}]`;
    porOrigem.set(k, (porOrigem.get(k) || 0) + 1);
  }
  const totalReatribuir = [...porDestino.values()].reduce((s, d) => s + d.ids.length, 0);
  console.log(`=== 1) Reatribuição: ${totalReatribuir} ações abertas para ${porDestino.size} vendedores ===`);
  [...porOrigem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log(`  ${k} → ${v}`));

  if (APPLY) {
    let feitas = 0;
    for (const d of porDestino.values()) {
      for (let i = 0; i < d.ids.length; i += 200) {
        const lote = d.ids.slice(i, i + 200);
        const { error } = await supabase.from('crm_acoes')
          .update({ vendedor_responsavel: d.cod, nome_vendedor: d.nome })
          .in('id', lote);
        if (error) console.error(`  erro em ${d.cod}: ${error.message}`);
        else feitas += lote.length;
      }
    }
    console.log(`  → ${feitas} ações reatribuídas.`);
  }

  // ---------- 2) Duplicatas de resgate ----------
  // Mesma regra do sql/12: 1 resgate ativo por grupo (CNPJ_RAIZ), preservando o que o
  // vendedor já tocou (EM_ANDAMENTO > REAGENDADA > PENDENTE) e, no empate, o mais recente.
  // Só apaga PENDENTE — nunca o que alguém já começou a trabalhar.
  const peso = { EM_ANDAMENTO: 0, REAGENDADA: 1, PENDENTE: 2 };
  const porGrupo = new Map();
  for (const a of abertas) {
    if (a.tipo !== 'LIGAR' || a.origem !== 'SISTEMA_AUTO') continue;
    const g = grupo.get(chave(a.codigo_cliente, a.loja_cliente)) || chave(a.codigo_cliente, a.loja_cliente);
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g).push(a);
  }
  const excluir = [];
  for (const lista of porGrupo.values()) {
    if (lista.length < 2) continue;
    lista.sort((x, y) => (peso[x.status] - peso[y.status]) || String(y.created_at).localeCompare(String(x.created_at)));
    for (const a of lista.slice(1)) {
      if (a.status === 'PENDENTE') excluir.push(a.id);
    }
  }
  console.log(`\n=== 2) Duplicatas de resgate: ${porGrupo.size} grupos com resgate ativo | ${excluir.length} ações a apagar ===`);

  if (APPLY && excluir.length) {
    let apagadas = 0;
    for (let i = 0; i < excluir.length; i += 100) {
      const lote = excluir.slice(i, i + 100);
      const { error } = await supabase.from('crm_acoes').delete().in('id', lote);
      if (error) console.error(`  erro ao apagar lote: ${error.message}`);
      else apagadas += lote.length;
    }
    console.log(`  → ${apagadas} duplicatas apagadas.`);
  }

  if (!APPLY) console.log('\nNada foi gravado. Rode com --apply para aplicar.');
}

run().catch(e => console.error(e));
