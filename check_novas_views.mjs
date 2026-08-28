// Validação da troca de fonte (3 views de BI) contra a planilha de amostra do TI.
// Espelha as regras dos processadores novos do /api/sync (processOrcamentoAberto/
// Cancelado/Faturado): filtros, montagem do id e parsing de data/número BR.
import xlsx from 'xlsx';

const filePath = process.argv[2] || 'C:\\Users\\fabiano.luz\\Downloads\\ORCAMENTOS.xlsx';
const wb = xlsx.readFile(filePath, { cellDates: false });
const rowsDe = (name) => xlsx.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: false });

// — mesmos parsers do route.ts —
const parseFinanceiro = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  if (s === '') return null;
  const num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(num) ? null : num;
};
const parseData = (val) => {
  if (!val) return null;
  const s = String(val).trim();
  if (s === '') return null;
  const m = s.match(/^\/Date\((\d+)\)\/$/);
  if (m) return new Date(parseInt(m[1], 10)).toISOString().split('T')[0];
  if (/^\d{8}$/.test(s)) return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (s.includes('-')) return s.split('T')[0];
  return s;
};
const t = (v) => (typeof v === 'string' ? v.trim() : v);

const stats = (nome, saida, descartadas) => {
  const ids = saida.map(r => r.id);
  const unicos = new Set(ids);
  console.log(`\n=== ${nome}: ${saida.length} aproveitadas, ${descartadas} descartadas pelo filtro ===`);
  console.log(`  ids únicos: ${unicos.size} de ${ids.length}${unicos.size < ids.length ? '  ⚠ DUPLICADOS no lote!' : ''}`);
  const semData = saida.filter(r => !r.ORC_DATA_EMISSAO_ORCAMENTO).length;
  const semNum = saida.filter(r => !r.ORC_NUMERO_ORCAMENTO).length;
  const valorNulo = saida.filter(r => r.ORC_VALOR_TOTAL == null).length;
  console.log(`  sem data de emissão: ${semData} | sem número: ${semNum} | sem valor total: ${valorNulo}`);
  console.log(`  exemplo: ${JSON.stringify(saida[0])}`);
  return unicos;
};

// ABERTOS + VENCIDOS — planilha ORCABERTOVENCIDO.xlsx (28/08), que já traz
// código+loja do cliente e os vencidos. As duas abas passam pelo MESMO
// processador: tudo entra como ABERTO e o app deriva VENCIDO pela validade.
const fileAbertos = process.argv[3] || 'C:\\Users\\fabiano.luz\\Downloads\\Orçamentos Edilson\\ORCABERTOVENCIDO.xlsx';
const wbAb = xlsx.readFile(fileAbertos, { cellDates: false });
const abertosRaw = ['ORC_ABERTO', 'ORC_VENCIDO'].flatMap(n =>
  xlsx.utils.sheet_to_json(wbAb.Sheets[n], { defval: null, raw: false }).map(r => ({ ...r, _aba: n }))
);
let abertosDescartados = 0;
const abertos = abertosRaw.filter(o => {
  const garantia = String(t(o.ORCAMENTO_TIPO_OPERACAO) || '').toUpperCase().includes('GARANTIA');
  if (garantia) abertosDescartados++;
  return !garantia;
}).map(o => {
  const out = {
    _aba: o._aba,
    FILIAL_ORC: t(o.ORCAMENTO_FILIAL),
    CODIGO_CLIENTE: t(o.ORCAMENTO_COD_CLI),
    LOJA_CLIENTE: t(o.ORCAMENTO_LOJ_CLI),
    CLIENTE_ORC: t(o.ORCAMENTO_NOME_CLIENTE),
    ORC_DATA_EMISSAO_ORCAMENTO: parseData(t(o.ORCAMENTO_EMISSAO)),
    ORC_DATA_ORCAMENTO: parseData(t(o.ORCAMENTO_VALIDADE)),
    CODIGO_PRODUTO_ORC: t(o.ORCAMENTO_PRODUTO),
    ORC_NUMERO_ORCAMENTO: t(o.ORCAMENTO_NUMERO),
    ORC_SALDO_ORCAMENTO: parseFinanceiro(o.ORCAMENTO_QUANTIDADE),
    ORC_VALOR_UNITARIO: parseFinanceiro(o.ORCAMENTO_PRECO),
    ORC_VALOR_TOTAL: parseFinanceiro(o.ORCAMENTO_TOTAL),
    ORC_CUSTO_PRODUTO: parseFinanceiro(o.ORCAMENTO_CUSTO),
    ORC_CODIGO_VENDEDOR: t(o.ORCAMENTO_CODIGO_VENDEDOR),
    ORC_NOME_VENDEDOR: t(o.ORCAMENTO_NOME_VENDEDOR),
    ORC_TIPO_OPERACAO: t(o.ORCAMENTO_TIPO_OPERACAO),
    Status: 'ABERTO',
  };
  out.id = `${out.FILIAL_ORC}_${out.ORC_NUMERO_ORCAMENTO}_${out.CODIGO_PRODUTO_ORC}`;
  return out;
});
const idsAbertos = stats('ABERTOS+VENCIDOS (filtro sem garantia)', abertos, abertosDescartados);
const ops = {};
for (const a of abertos) ops[a.ORC_TIPO_OPERACAO] = (ops[a.ORC_TIPO_OPERACAO] || 0) + 1;
console.log(`  tipos de operação após o filtro: ${JSON.stringify(ops)}`);
const semCli = abertos.filter(a => !a.CODIGO_CLIENTE || !a.LOJA_CLIENTE).length;
console.log(`  sem código/loja de cliente: ${semCli}`);
// A validade deve separar as abas: ABERTO no futuro, VENCIDO no passado.
const hojeStr = new Date().toISOString().split('T')[0];
const INDEF = '2030-12-31'; // validade indefinida (padrão Protheus)
for (const aba of ['ORC_ABERTO', 'ORC_VENCIDO']) {
  const doAba = abertos.filter(a => a._aba === aba);
  const passado = doAba.filter(a => a.ORC_DATA_ORCAMENTO && a.ORC_DATA_ORCAMENTO < hojeStr).length;
  const indef = doAba.filter(a => a.ORC_DATA_ORCAMENTO === INDEF).length;
  console.log(`  ${aba}: ${doAba.length} linhas | validade no passado: ${passado} | indefinida (2030): ${indef}`);
}

// CANCELADOS
const cancRaw = rowsDe('ORÇAMENTO_CANCELADO');
const cancelados = [];
let cancDescartadas = 0;
for (const o of cancRaw) {
  if (String(t(o.Status_orcamento) || '').toUpperCase() !== 'CANCELADO') { cancDescartadas++; continue; }
  const dataCanc = parseData(t(o.Data_Cancelamento));
  const out = {
    FILIAL_ORC: t(o.Codigo_Filial),
    CODIGO_CLIENTE: t(o.Codigo_cliente),
    LOJA_CLIENTE: t(o.Loja_cliente),
    CLIENTE_ORC: t(o.Nome_cliente),
    ORC_DATA_EMISSAO_ORCAMENTO: parseData(t(o.Data_orcamento)),
    CODIGO_PRODUTO_ORC: t(o.Codigo_item),
    ORC_NUMERO_ORCAMENTO: t(o.Num_orc),
    ORC_SALDO_ORCAMENTO: parseFinanceiro(o.Quantidade),
    ORC_VALOR_TOTAL: parseFinanceiro(o.Valor),
    ORC_CODIGO_VENDEDOR: t(o.Codigo_vendedor),
    ORC_NOME_VENDEDOR: t(o.Nome_vendedor),
    MOTIVO_CANCELAMENTO: t(o.Descricao_motivo) === 'NULL' ? null : t(o.Descricao_motivo),
    DATA_CANCELAMENTO: dataCanc && dataCanc > '1901-01-01' ? dataCanc : null,
    Status: 'CANCELADO',
  };
  out.id = `${out.FILIAL_ORC}_${out.ORC_NUMERO_ORCAMENTO}_${out.CODIGO_PRODUTO_ORC}`;
  cancelados.push(out);
}
const idsCanc = stats('CANCELADOS (filtro Status_orcamento=Cancelado)', cancelados, cancDescartadas);
if (cancelados.length) {
  const comMotivo = cancelados.filter(c => c.MOTIVO_CANCELAMENTO).length;
  const comData = cancelados.filter(c => c.DATA_CANCELAMENTO).length;
  console.log(`  com motivo: ${comMotivo} | com data de cancelamento: ${comData}`);
}

// FATURADOS
const fatRaw = rowsDe('ORÇAMENTO_FATURADO');
const faturados = [];
let fatDescartadas = 0;
for (const o of fatRaw) {
  if (!o.NUMERO_ORCAMENTO || String(o.NUMERO_ORCAMENTO).trim() === '') { fatDescartadas++; continue; }
  const out = {
    FILIAL_ORC: t(o.FILIAL),
    CODIGO_CLIENTE: t(o.CLIENTE),
    LOJA_CLIENTE: t(o.LOJA),
    CLIENTE_ORC: t(o.A1_NOME),
    ORC_DATA_EMISSAO_ORCAMENTO: parseData(t(o.DATA_ORCAMENTO)),
    CODIGO_PRODUTO_ORC: t(o.CODIGO),
    ORC_NUMERO_ORCAMENTO: t(o.NUMERO_ORCAMENTO),
    ORC_SALDO_ORCAMENTO: parseFinanceiro(o.QUANTIDADE),
    ORC_VALOR_UNITARIO: parseFinanceiro(o.UNITARIO),
    ORC_VALOR_TOTAL: parseFinanceiro(o.TOTAL),
    ORC_CUSTO_PRODUTO: parseFinanceiro(o.CUSTO),
    ORC_CODIGO_VENDEDOR: t(o.COD_VENDEDOR),
    ORC_NOME_VENDEDOR: t(o.VENDEDOR),
    Status: 'FATURADO',
  };
  out.id = `${out.FILIAL_ORC}_${out.ORC_NUMERO_ORCAMENTO}_${out.CODIGO_PRODUTO_ORC}`;
  faturados.push(out);
}
const idsFat = stats('FATURADOS (filtro NUMERO_ORCAMENTO preenchido)', faturados, fatDescartadas);

// Colisões entre estados (mesmo id em duas abas = precedência do upsert decide)
const inter = (a, b) => [...a].filter(x => b.has(x));
console.log('\n=== Colisões de id entre abas (mesma linha em 2 estados) ===');
console.log(`  aberto ∩ cancelado: ${inter(idsAbertos, idsCanc).length}`);
console.log(`  aberto ∩ faturado : ${inter(idsAbertos, idsFat).length}`);
console.log(`  cancelado ∩ faturado: ${inter(idsCanc, idsFat).length}`);

// Compatibilidade de formato com a base atual (id antigo: FILIAL_NUMERO_PRODUTO)
console.log('\n=== Formato dos ids gerados (deve casar com o padrão atual) ===');
console.log(`  abertos : ${abertos[0]?.id}`);
console.log(`  cancel. : ${cancelados[0]?.id ?? '(amostra sem linha Cancelado)'}`);
console.log(`  faturado: ${faturados[0]?.id}`);
