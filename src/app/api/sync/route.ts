import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// =====================================================================
// SANITIZADORES baseados no Dicionário de Dados do ERP Protheus/Bouwman
// =====================================================================

// Remove padding de espaços de TODOS os campos texto (Protheus preenche com espaços fixos)
function trimAll(record: any): any {
  const clean: any = {};
  for (const key of Object.keys(record)) {
    const val = record[key];
    if (typeof val === 'string') {
      clean[key] = val.trim();
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

// Converte campo financeiro BR (vírgula decimal) para número real
function parseFinanceiro(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  if (s === '') return null;
  // Remove pontos de milhar, troca vírgula por ponto
  const converted = s.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(converted);
  return isNaN(num) ? null : num;
}

// Converte campo que vem como número ou null (DIAS_SEM_COMPRA, NF_12M, QUANTIDADE, etc.)
function parseNumerico(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  if (s === '') return null;
  const num = parseFloat(s.replace(',', '.'));
  return isNaN(num) ? null : num;
}

// Converte formatos de datas do Protheus (/Date(ms)/ ou YYYYMMDD ou YYYY-MM-DD) para YYYY-MM-DD
function parseData(val: any): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (s === '') return null;
  
  // Formato ASP.NET: /Date(1775098800000)/
  const match = s.match(/^\/Date\((\d+)\)\/$/);
  if (match) {
    const ms = parseInt(match[1], 10);
    return new Date(ms).toISOString().split('T')[0];
  }
  
  // Formato numérico YYYYMMDD: 20240702
  if (/^\d{8}$/.test(s)) {
    return `${s.substring(0,4)}-${s.substring(4,6)}-${s.substring(6,8)}`;
  }

  // Formato brasileiro DD/MM/YYYY: 11/03/2025 → 2025-03-11
  const brMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }

  // Formato ISO Padrão já contendo traços
  if (s.includes('-')) {
    return s.split('T')[0];
  }

  return s;
}

// =====================================================================
// PROCESSADORES POR ENTIDADE (campos específicos do dicionário)
// =====================================================================

function processCliente(c: any): any {
  const r = trimAll(c);
  r.id = `${r.FILIAL}_${r.CODIGO_CLIENTE}_${r.LOJA_CLIENTE}`;
  // Campos numéricos do dicionário
  r.DIAS_SEM_COMPRA = parseNumerico(r.DIAS_SEM_COMPRA);
  r.NF_12M = parseNumerico(r.NF_12M);
  r.DATA_ULT_COMPRA = parseData(r.DATA_ULT_COMPRA);
  return r;
}

function processOrcamento(o: any): any {
  const r = trimAll(o);
  // Garante unicidade usando ORC_NUMERO_ORCAMENTO + CODIGO_PRODUTO_ORC
  r.id = `${r.FILIAL_ORC}_${r.ORC_NUMERO_ORCAMENTO}_${r.CODIGO_PRODUTO_ORC}`;
  // Datas
  r.ORC_DATA_EMISSAO_ORCAMENTO = parseData(r.ORC_DATA_EMISSAO_ORCAMENTO);
  r.ORC_DATA_ORCAMENTO = parseData(r.ORC_DATA_ORCAMENTO);
  // Campos financeiros BR (texto com vírgula) → número
  r.ORC_SALDO_ORCAMENTO = parseFinanceiro(r.ORC_SALDO_ORCAMENTO);
  r.ORC_VALOR_UNITARIO = parseFinanceiro(r.ORC_VALOR_UNITARIO);
  r.ORC_VALOR_TOTAL = parseFinanceiro(r.ORC_VALOR_TOTAL);
  r.ORC_CUSTO_PRODUTO = parseFinanceiro(r.ORC_CUSTO_PRODUTO);
  
  // Mapeamento da coluna STATUS vinda do ERP (trata variações de nome do cabeçalho).
  // ANTES: default 'ABERTO' quando o campo vinha undefined — causou bug onde 100% dos
  // registros ficavam ABERTO porque a query SELECT antiga não pedia [STATUS]. Agora,
  // se o ERP não mandar nada, grava null e o getStatusOrcamento() do front trata como
  // ABERTO. Assim qualquer valor real do ERP (FATURADO/CANCELADO/VENCIDO) é respeitado.
  const rawStatus = o.STATUS ?? o.Status ?? o.status ?? o.STATUS_ORCAMENTO ?? o.Situacao;
  const statusStr = rawStatus != null && String(rawStatus).trim() !== ''
    ? String(rawStatus).toUpperCase().trim()
    : null;

  // IMPORTANTE: a coluna real no Postgres é "Status" (case-sensitive por causa
  // das aspas duplas). O Supabase rejeita upsert com chaves desconhecidas (500),
  // então removemos as variantes copiadas pelo trimAll antes de regravar a canônica.
  delete r.STATUS;
  delete r.status;
  delete r.STATUS_ORCAMENTO;
  delete r.Situacao;
  r.Status = statusStr;

  return r;
}

// =====================================================================
// NOVA FONTE (3 views de BI, e-mail do TI de 27/08/2026): o status deixa
// de ser um campo e passa a ser derivado da view de origem. A view antiga
// [dbo].[ORCAMENTO] congelava o STATUS na extração — cancelamentos que
// removiam o registro da view nunca chegavam aqui (caso 010203/00008543).
// O id continua FILIAL_NUMERO_PRODUTO, compatível com a base existente.
// Upsert só toca as colunas enviadas — STATUS_OVERRIDE segue intocado.
// =====================================================================

// V_BI_SUPRIMENTOS_ORCAMENTOS (abertos) e V_BI_SUPRIMENTOS_ORCAMENTOS_VENC
// (vencidos) → ABERTO. As duas views têm as mesmas colunas e usam este mesmo
// processador: gravamos ABERTO e o app deriva VENCIDO pela validade
// (getStatusVivo), como já fazia. Garantias ficam fora do funil
// (decisão do Vanderlei, 28/08/2026) — o SQL do .ps1 já filtra; aqui é a
// segunda barreira. Devolve null para linha descartada.
function processOrcamentoAberto(o: any): any | null {
  const r = trimAll(o);
  if (String(r.ORCAMENTO_TIPO_OPERACAO || '').toUpperCase().includes('GARANTIA')) return null;
  const out: any = {
    FILIAL_ORC: r.ORCAMENTO_FILIAL,
    CODIGO_CLIENTE: r.ORCAMENTO_COD_CLI,
    LOJA_CLIENTE: r.ORCAMENTO_LOJ_CLI,
    CLIENTE_ORC: r.ORCAMENTO_NOME_CLIENTE,
    ORC_DATA_EMISSAO_ORCAMENTO: parseData(r.ORCAMENTO_EMISSAO),
    ORC_DATA_ORCAMENTO: parseData(r.ORCAMENTO_VALIDADE),
    CODIGO_PRODUTO_ORC: r.ORCAMENTO_PRODUTO,
    ORC_NUMERO_ORCAMENTO: r.ORCAMENTO_NUMERO,
    ORC_SALDO_ORCAMENTO: parseFinanceiro(r.ORCAMENTO_QUANTIDADE),
    ORC_VALOR_UNITARIO: parseFinanceiro(r.ORCAMENTO_PRECO),
    ORC_VALOR_TOTAL: parseFinanceiro(r.ORCAMENTO_TOTAL),
    ORC_CUSTO_PRODUTO: parseFinanceiro(r.ORCAMENTO_CUSTO),
    ORC_CODIGO_VENDEDOR: r.ORCAMENTO_CODIGO_VENDEDOR,
    ORC_NOME_VENDEDOR: r.ORCAMENTO_NOME_VENDEDOR,
    ORC_TIPO_OPERACAO: r.ORCAMENTO_TIPO_OPERACAO,
    Status: 'ABERTO',
  };
  out.id = `${out.FILIAL_ORC}_${out.ORC_NUMERO_ORCAMENTO}_${out.CODIGO_PRODUTO_ORC}`;
  return out;
}

// V_BI_ORCAMENTOS_CANCELADOS → CANCELADO.
// A view devolve TODO o histórico com Status_orcamento 'Cancelado' e
// 'Não Cancelado' — o filtro é obrigatório (OBS do TI). O SQL do .ps1 já
// filtra; aqui é a segunda barreira. Devolve null para linha descartada.
function processOrcamentoCancelado(o: any): any | null {
  const r = trimAll(o);
  if (String(r.Status_orcamento || '').toUpperCase() !== 'CANCELADO') return null;
  // 1900-01-01 é o "sem data" do Protheus.
  const dataCanc = parseData(r.Data_Cancelamento);
  const out: any = {
    FILIAL_ORC: r.Codigo_Filial,
    CODIGO_CLIENTE: r.Codigo_cliente,
    LOJA_CLIENTE: r.Loja_cliente,
    CLIENTE_ORC: r.Nome_cliente,
    ORC_DATA_EMISSAO_ORCAMENTO: parseData(r.Data_orcamento),
    CODIGO_PRODUTO_ORC: r.Codigo_item,
    ORC_NUMERO_ORCAMENTO: r.Num_orc,
    ORC_SALDO_ORCAMENTO: parseFinanceiro(r.Quantidade),
    ORC_VALOR_TOTAL: parseFinanceiro(r.Valor),
    ORC_CODIGO_VENDEDOR: r.Codigo_vendedor,
    ORC_NOME_VENDEDOR: r.Nome_vendedor,
    MOTIVO_CANCELAMENTO: r.Descricao_motivo === 'NULL' ? null : r.Descricao_motivo,
    DATA_CANCELAMENTO: dataCanc && dataCanc > '1901-01-01' ? dataCanc : null,
    Status: 'CANCELADO',
  };
  out.id = `${out.FILIAL_ORC}_${out.ORC_NUMERO_ORCAMENTO}_${out.CODIGO_PRODUTO_ORC}`;
  return out;
}

// V_BI_SUPRIMENTOS_VENDAS → FATURADO.
// Só linhas com NUMERO_ORCAMENTO preenchido são orçamento faturado (OBS do
// TI); venda direta sem orçamento não entra. Devolve null para descartadas.
function processOrcamentoFaturado(o: any): any | null {
  const r = trimAll(o);
  if (!r.NUMERO_ORCAMENTO || String(r.NUMERO_ORCAMENTO).trim() === '') return null;
  const out: any = {
    FILIAL_ORC: r.FILIAL,
    CODIGO_CLIENTE: r.CLIENTE,
    LOJA_CLIENTE: r.LOJA,
    CLIENTE_ORC: r.A1_NOME,
    ORC_DATA_EMISSAO_ORCAMENTO: parseData(r.DATA_ORCAMENTO),
    CODIGO_PRODUTO_ORC: r.CODIGO,
    ORC_NUMERO_ORCAMENTO: r.NUMERO_ORCAMENTO,
    ORC_SALDO_ORCAMENTO: parseFinanceiro(r.QUANTIDADE),
    ORC_VALOR_UNITARIO: parseFinanceiro(r.UNITARIO),
    ORC_VALOR_TOTAL: parseFinanceiro(r.TOTAL),
    ORC_CUSTO_PRODUTO: parseFinanceiro(r.CUSTO),
    ORC_CODIGO_VENDEDOR: r.COD_VENDEDOR,
    ORC_NOME_VENDEDOR: r.VENDEDOR,
    Status: 'FATURADO',
  };
  out.id = `${out.FILIAL_ORC}_${out.ORC_NUMERO_ORCAMENTO}_${out.CODIGO_PRODUTO_ORC}`;
  return out;
}

function processMaquina(m: any, index: number): any {
  const r = trimAll(m);
  // Usa um ID determinístico baseado em chaves fortes para permitir o UPSERT
  // e evitar duplicação massiva no banco a cada sincronização.
  r.id = `${r.FILIAL}_${r.CODIGO || ''}_${r.CHASSI || ''}_${r.NOTA_FISCAL || ''}`;
  
  // Datas
  r.EMISSAO = parseData(r.EMISSAO);
  r.PRIMEIRA_COMPRA = parseData(r.PRIMEIRA_COMPRA);
  r.ULTIMA_COMPRA = parseData(r.ULTIMA_COMPRA);

  // Campos numéricos inteiros
  r.QUANTIDADE = parseNumerico(r.QUANTIDADE);
  r.NUMERO_DE_COMPRAS = parseNumerico(r.NUMERO_DE_COMPRAS);
  // Campo financeiro BR (texto com vírgula)
  r.TOTAL = parseFinanceiro(r.TOTAL);
  
  // Colunas não presentes no banco Supabase sendo descartadas:
  delete r.CUSTO;
  
  return r;
}

// =====================================================================
// ROTA POST: Recebe lotes do PowerShell e grava no Supabase
// =====================================================================
export async function POST(request: Request) {
  try {
    // Autenticação
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.SYNC_API_KEY || 'bouwman_sync_ak_7a8b9c0d1e2f3g4h5i';
    if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const payload = await request.json();

    // [Shield de Substituição (Sync Override)]
    // Buscar solicitações de contato manuais PENDENTES para prevalecerem sobre a carga ERP
    const { data: pendentes, error: errPendentes } = await supabase
      .from('crm_solicitacoes_alteracao')
      .select('*')
      .eq('status', 'PENDENTE');

    const overrides = new Map();
    if (!errPendentes && pendentes) {
      for (const p of pendentes) {
        // Usa o codigo_cliente_loja_cliente como chave para identificar quem precisa de escudo
        overrides.set(`${p.codigo_cliente}_${p.loja_cliente}`, p);
      }
    }

    // Processar cada entidade com seu sanitizador específico
    const clientes = (payload.Clientes || []).map((c: any) => {
      const parsed = processCliente(c);
      
      // Aplicar o escudo de substituição se houver pendência
      const shieldKey = `${parsed.CODIGO_CLIENTE}_${parsed.LOJA_CLIENTE}`;
      if (overrides.has(shieldKey)) {
        const shield = overrides.get(shieldKey);
        if (shield.email_novo) {
          parsed.EMAIL = shield.email_novo;
        }
        if (shield.telefone_novo) {
          parsed.TELEFONE = shield.telefone_novo;
          parsed.CELULAR_WHATSAPP_CONTATO = shield.telefone_novo;
        }
      }
      return parsed;
    });
    const orcamentos = (payload.Orcamentos || []).map((o: any) => processOrcamento(o));
    const maquinas = (payload.Maquinas || []).map((m: any, i: number) => processMaquina(m, i));

    // Nova fonte (3 views de BI). Dedup por id dentro do lote: o Postgres
    // rejeita upsert que toca o mesmo id duas vezes na mesma chamada.
    const dedupePorId = (lista: any[]) => [...new Map(lista.map(r => [r.id, r])).values()];
    const orcAbertos = dedupePorId([...(payload.OrcamentosAbertos || []), ...(payload.OrcamentosVencidos || [])]
      .map(processOrcamentoAberto).filter(Boolean));
    const orcCancelados = dedupePorId((payload.OrcamentosCancelados || []).map(processOrcamentoCancelado).filter(Boolean));
    const orcFaturados = dedupePorId((payload.OrcamentosFaturados || []).map(processOrcamentoFaturado).filter(Boolean));

    const erros: string[] = [];

    // UPSERT Clientes
    if (clientes.length > 0) {
      const { error } = await supabase.from('crm_clientes').upsert(clientes, { onConflict: 'id' });
      if (error) erros.push(`Clientes: ${error.message} | ${error.details || ''}`);
    }

    // UPSERT Orçamentos
    if (orcamentos.length > 0) {
      const { error } = await supabase.from('crm_orcamentos').upsert(orcamentos, { onConflict: 'id' });
      if (error) erros.push(`Orcamentos: ${error.message} | ${error.details || ''}`);
    }

    // UPSERT Máquinas
    if (maquinas.length > 0) {
      const { error } = await supabase.from('crm_parquemaquinas').upsert(maquinas, { onConflict: 'id' });
      if (error) erros.push(`Maquinas: ${error.message} | ${error.details || ''}`);
    }

    // UPSERT nova fonte — cada lote do .ps1 traz uma entidade só, então a
    // ordem dentro de uma chamada não importa; o que importa é que estados
    // terminais (CANCELADO/FATURADO) prevalecem sobre ABERTO ao longo das
    // cargas, e o upsert por id garante isso.
    if (orcAbertos.length > 0) {
      const { error } = await supabase.from('crm_orcamentos').upsert(orcAbertos, { onConflict: 'id' });
      if (error) erros.push(`OrcamentosAbertos: ${error.message} | ${error.details || ''}`);
    }
    if (orcCancelados.length > 0) {
      const { error } = await supabase.from('crm_orcamentos').upsert(orcCancelados, { onConflict: 'id' });
      if (error) erros.push(`OrcamentosCancelados: ${error.message} | ${error.details || ''}`);
    }
    if (orcFaturados.length > 0) {
      const { error } = await supabase.from('crm_orcamentos').upsert(orcFaturados, { onConflict: 'id' });
      if (error) erros.push(`OrcamentosFaturados: ${error.message} | ${error.details || ''}`);
    }

    if (erros.length > 0) {
      console.error('Erros Supabase:', JSON.stringify(erros));
      return NextResponse.json({ error: 'Erro no banco', detalhes: erros }, { status: 500 });
    }

    const msg = `Sync OK: ${clientes.length} cli, ${orcamentos.length} orc, ${maquinas.length} maq, ` +
      `${orcAbertos.length} orc-abertos, ${orcCancelados.length} orc-cancelados, ${orcFaturados.length} orc-faturados`;
    console.log(msg);


    return NextResponse.json({
      success: true,
      message: msg,
      totais: { clientes: clientes.length, orcamentos: orcamentos.length, maquinas: maquinas.length }
    });

  } catch (error: any) {
    console.error('ERRO FATAL:', error.message || error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
