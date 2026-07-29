// Repara o vínculo ação ↔ cliente considerando a EMPRESA/FILIAL.
//
// O par (código, loja) não é único: repete entre as empresas 01/05/10/15 com clientes
// diferentes (000038/01 é LAERTE na filial 01 e RODRIGO BAGATINI na 10). São 414 pares
// repetidos. Uma correção anterior casou só por código+loja e mandou 35 ações para o
// vendedor errado, além de misturar ações no Cliente360.
//
// O que faz:
//   1. Descobre o cadastro real de cada ação aberta (par único → direto; senão pela
//      filial_cliente, pela filial do orçamento, ou pelo nome do cliente).
//   2. Carimba filial_cliente onde está vazia — sem isso a ação não tem como ser ligada
//      ao cliente certo daqui pra frente.
//   3. Devolve vendedor_responsavel ao dono do cadastro certo.
//
// Rodar: node fix_acoes_filial.mjs          → só relatório (dry-run)
//        node fix_acoes_filial.mjs --apply  → aplica
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

try {
  fs.readFileSync('.env.local', 'utf-8').split('\n').forEach(l => {
    const m = l.match(/^([^=]+)=(.*)$/);
    if (m) { let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); process.env[m[1].trim()] = v; }
  });
} catch (e) {}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

const pageAll = async (t, cols, tweak = q => q) => {
  const out = []; let from = 0;
  while (true) {
    const { data, error } = await tweak(supabase.from(t).select(cols)).range(from, from + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
};

const chave = (cod, loja) =>
  `${String(cod ?? '').trim().padStart(6, '0')}_${String(loja ?? '').trim().padStart(2, '0')}`;
const filialDe = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return (s.length > 2 ? s.slice(0, 2) : s).padStart(2, '0');
};
const norm = (s) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
const ABERTAS = ['PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA'];

async function run() {
  console.log(APPLY ? '>>> MODO APLICAR <<<\n' : '>>> DRY-RUN (nada será gravado) <<<\n');

  const clientes = await pageAll('crm_clientes', 'FILIAL, CODIGO_CLIENTE, LOJA_CLIENTE, NOME_CLIENTE, VENDEDOR_RESP, NOME_VENDEDOR_RESP');
  const porPar = new Map();
  for (const c of clientes) {
    const k = chave(c.CODIGO_CLIENTE, c.LOJA_CLIENTE);
    const l = porPar.get(k);
    if (l) l.push(c); else porPar.set(k, [c]);
  }

  const acoes = await pageAll('crm_acoes',
    'id, tipo, status, origem, codigo_cliente, loja_cliente, filial_cliente, nome_cliente, numero_orcamento, vendedor_responsavel, nome_vendedor',
    q => q.in('status', ABERTAS));

  // Filial dos orçamentos citados pelas ações (FILIAL_ORC = '010206' → filial '01')
  const numeros = [...new Set(acoes.map(a => a.numero_orcamento).filter(Boolean).map(String))];
  const filialDoOrc = new Map();
  for (let i = 0; i < numeros.length; i += 200) {
    const lote = numeros.slice(i, i + 200);
    const { data } = await supabase.from('crm_orcamentos')
      .select('ORC_NUMERO_ORCAMENTO, FILIAL_ORC').in('ORC_NUMERO_ORCAMENTO', lote);
    for (const o of data || []) filialDoOrc.set(String(o.ORC_NUMERO_ORCAMENTO), filialDe(o.FILIAL_ORC));
  }

  const via = { parUnico: 0, filialDaAcao: 0, filialDoOrcamento: 0, nomeDoCliente: 0, naoResolvido: 0 };
  const resolvidas = new Map(); // id -> cadastro

  for (const a of acoes) {
    if (a.codigo_cliente == null) continue;
    const cands = porPar.get(chave(a.codigo_cliente, a.loja_cliente));
    if (!cands?.length) { via.naoResolvido++; continue; }
    if (cands.length === 1) { resolvidas.set(a.id, cands[0]); via.parUnico++; continue; }

    const fAcao = filialDe(a.filial_cliente);
    if (fAcao) {
      const c = cands.find(x => filialDe(x.FILIAL) === fAcao);
      if (c) { resolvidas.set(a.id, c); via.filialDaAcao++; continue; }
    }
    const fOrc = a.numero_orcamento ? filialDoOrc.get(String(a.numero_orcamento)) : null;
    if (fOrc) {
      const c = cands.find(x => filialDe(x.FILIAL) === fOrc);
      if (c) { resolvidas.set(a.id, c); via.filialDoOrcamento++; continue; }
    }
    const porNome = cands.filter(x => norm(x.NOME_CLIENTE) === norm(a.nome_cliente));
    if (porNome.length === 1) { resolvidas.set(a.id, porNome[0]); via.nomeDoCliente++; continue; }

    via.naoResolvido++;
  }

  console.log(`=== Ações abertas: ${acoes.length} | resolvidas: ${resolvidas.size} ===`);
  console.log('  como foram resolvidas:', JSON.stringify(via, null, 0).replace(/[{}"]/g, ''));

  // ---- 1) Carimbar filial_cliente onde está vazia ou divergente ----
  const porFilial = new Map();
  for (const a of acoes) {
    const c = resolvidas.get(a.id);
    if (!c) continue;
    const nova = filialDe(c.FILIAL);
    if (!nova || filialDe(a.filial_cliente) === nova) continue;
    if (!porFilial.has(nova)) porFilial.set(nova, []);
    porFilial.get(nova).push(a.id);
  }
  const totalFilial = [...porFilial.values()].reduce((s, v) => s + v.length, 0);
  console.log(`\n=== 1) Carimbar filial_cliente: ${totalFilial} ações ===`);
  [...porFilial.entries()].sort().forEach(([f, ids]) => console.log(`  filial ${f} → ${ids.length}`));

  if (APPLY) {
    let n = 0;
    for (const [f, ids] of porFilial) {
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200);
        const { error } = await supabase.from('crm_acoes').update({ filial_cliente: f }).in('id', lote);
        if (error) console.error(`  erro filial ${f}: ${error.message}`);
        else n += lote.length;
      }
    }
    console.log(`  → ${n} ações carimbadas.`);
  }

  // ---- 2) Vendedor correto ----
  const porDestino = new Map();
  const detalhe = new Map();
  for (const a of acoes) {
    const c = resolvidas.get(a.id);
    if (!c?.VENDEDOR_RESP) continue;
    const cod = String(c.VENDEDOR_RESP).trim();
    if (cod === String(a.vendedor_responsavel ?? '').trim()) continue;
    if (!porDestino.has(cod)) porDestino.set(cod, { cod, nome: c.NOME_VENDEDOR_RESP, ids: [] });
    porDestino.get(cod).ids.push(a.id);
    const k = `${a.vendedor_responsavel} → ${cod} (${c.NOME_VENDEDOR_RESP})`;
    detalhe.set(k, (detalhe.get(k) || 0) + 1);
  }
  const totalVend = [...porDestino.values()].reduce((s, d) => s + d.ids.length, 0);
  console.log(`\n=== 2) Corrigir vendedor_responsavel: ${totalVend} ações ===`);
  [...detalhe.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log(`  ${k} → ${v}`));

  if (APPLY) {
    let n = 0;
    for (const d of porDestino.values()) {
      for (let i = 0; i < d.ids.length; i += 200) {
        const lote = d.ids.slice(i, i + 200);
        const { error } = await supabase.from('crm_acoes')
          .update({ vendedor_responsavel: d.cod, nome_vendedor: d.nome }).in('id', lote);
        if (error) console.error(`  erro ${d.cod}: ${error.message}`);
        else n += lote.length;
      }
    }
    console.log(`  → ${n} ações corrigidas.`);
  }

  if (!APPLY) console.log('\nNada foi gravado. Rode com --apply para aplicar.');
}

run().catch(e => console.error(e));
