// Diagnóstico: ações que não acompanharam a troca de carteira + duplicação do robô.
// Motivo: crm_acoes grava codigo_cliente/loja_cliente como NÚMERO (3193, 1) e
// crm_clientes guarda TEXTO zero-padded ('003193', '01'). Qualquer cruzamento
// precisa normalizar com padStart, senão casa zero linhas.
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

const pageAll = async (table, cols, tweak = q => q) => {
  const out = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await tweak(supabase.from(table).select(cols)).range(from, from + PAGE - 1);
    if (error) { console.log(`erro ${table}: ${error.message}`); break; }
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
};

const pad = (v, n) => String(v ?? '').trim().padStart(n, '0');
const chave = (cod, loja) => `${pad(cod, 6)}|${pad(loja, 2)}`;
const filialDe = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return (s.length > 2 ? s.slice(0, 2) : s).padStart(2, '0');
};
const ABERTAS = ['PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA'];

async function run() {
  const clientes = await pageAll('crm_clientes', 'FILIAL, CODIGO_CLIENTE, LOJA_CLIENTE, NOME_CLIENTE, VENDEDOR_RESP, NOME_VENDEDOR_RESP');
  const porPar = new Map();
  for (const c of clientes) {
    const k = chave(c.CODIGO_CLIENTE, c.LOJA_CLIENTE);
    const l = porPar.get(k);
    if (l) l.push(c); else porPar.set(k, [c]);
  }

  // Mesmo critério do app (buildIndiceClientes): par único resolve direto; par repetido
  // entre filiais só resolve se a ação disser a filial. Na dúvida, não vincula.
  const cadastroDaAcao = (a) => {
    if (a.codigo_cliente == null) return null;
    const cands = porPar.get(chave(a.codigo_cliente, a.loja_cliente));
    if (!cands?.length) return null;
    if (cands.length === 1) return cands[0];
    const f = filialDe(a.filial_cliente);
    if (!f) return null;
    return cands.find(c => filialDe(c.FILIAL) === f) || null;
  };

  const acoes = await pageAll('crm_acoes', 'id, tipo, status, origem, vendedor_responsavel, nome_vendedor, codigo_cliente, loja_cliente, filial_cliente, created_at',
    q => q.in('status', ABERTAS));

  // 1) Órfãs: ação aberta cujo vendedor ≠ dono atual do cliente
  const porDivergencia = new Map();
  let orfas = 0, semCadastro = 0, semCliente = 0;
  for (const a of acoes) {
    if (a.codigo_cliente == null) { semCliente++; continue; }
    const c = cadastroDaAcao(a);
    if (!c) { semCadastro++; continue; }
    if (String(c.VENDEDOR_RESP || '').trim() !== String(a.vendedor_responsavel || '').trim()) {
      orfas++;
      const k = `${a.vendedor_responsavel} (${a.nome_vendedor}) → ${c.VENDEDOR_RESP} (${c.NOME_VENDEDOR_RESP})`;
      porDivergencia.set(k, (porDivergencia.get(k) || 0) + 1);
    }
  }
  console.log(`=== Ações abertas: ${acoes.length} | órfãs: ${orfas} | ambíguas/sem cadastro: ${semCadastro} | sem cliente: ${semCliente} ===`);
  [...porDivergencia.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`  ${k} → ${v}`));

  // 2) Duplicação de resgate (LIGAR automático) por cliente
  const ligar = acoes.filter(a => a.tipo === 'LIGAR' && a.origem === 'SISTEMA_AUTO');
  const porCli = new Map();
  for (const a of ligar) {
    const c = cadastroDaAcao(a);
    const k = c ? `${filialDe(c.FILIAL)}_${chave(c.CODIGO_CLIENTE, c.LOJA_CLIENTE)}` : `AMB_${a.id}`;
    porCli.set(k, (porCli.get(k) || 0) + 1);
  }
  console.log(`\n=== Resgates (LIGAR/SISTEMA_AUTO) pendentes: ${ligar.length} para ${porCli.size} clientes | excedente: ${ligar.length - porCli.size} ===`);
  const porDia = new Map();
  for (const a of ligar) {
    const d = String(a.created_at).slice(0, 10);
    porDia.set(d, (porDia.get(d) || 0) + 1);
  }
  console.log('  criadas por dia (últimos 10 dias com criação):');
  [...porDia.entries()].sort().slice(-10).forEach(([k, v]) => console.log(`    ${k} → ${v}`));

  // 3) Vendedores sem nenhuma ação, mas com carteira
  const carteira = new Map();
  for (const c of clientes) {
    if (!c.VENDEDOR_RESP) continue;
    carteira.set(c.VENDEDOR_RESP, (carteira.get(c.VENDEDOR_RESP) || 0) + 1);
  }
  const comAcao = new Set(acoes.map(a => String(a.vendedor_responsavel || '').trim()));
  const semAcao = [...carteira.entries()].filter(([cod, n]) => n >= 50 && !comAcao.has(cod));
  console.log(`\n=== Vendedores com carteira ≥50 clientes e ZERO ações abertas ===`);
  if (!semAcao.length) console.log('  (nenhum)');
  semAcao.sort((a, b) => b[1] - a[1]).forEach(([cod, n]) => {
    const nome = clientes.find(c => c.VENDEDOR_RESP === cod)?.NOME_VENDEDOR_RESP;
    console.log(`  ${cod} (${nome}) → ${n} clientes, 0 ações`);
  });
}

run().catch(e => console.error(e));
