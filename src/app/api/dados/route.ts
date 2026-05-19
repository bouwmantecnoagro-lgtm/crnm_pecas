import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const COLS_CLIENTES = [
  'id', 'FILIAL', 'CODIGO_CLIENTE', 'LOJA_CLIENTE', 'NOME_CLIENTE',
  'CNPJ_CPF', 'CNPJ_RAIZ', 'CIDADE', 'UF', 'VENDEDOR_RESP', 'NOME_VENDEDOR_RESP',
  'DDD', 'TELEFONE', 'CELULAR_WHATSAPP_CONTATO', 'EMAIL',
  'DIAS_SEM_COMPRA', 'DATA_ULT_COMPRA', 'NF_12M', 'STATUS_BASE',
  'MARCA_CONCORRENTE', 'MODELO_CONCORRENTE', 'DATA_MARCA_CONCORRENTE',
  'updated_at'
].join(',');

// Coluna real no Supabase é "Status" (S maiúsculo, resto minúsculo)
// STATUS_OVERRIDE é definido pelo CRM (ex: ação SEM_INTERESSE cancela). Prevalece sobre Status.
const COLS_ORCAMENTOS = [
  'id', 'FILIAL_ORC', 'CODIGO_CLIENTE', 'LOJA_CLIENTE', 'CLIENTE_ORC',
  'ORC_DATA_EMISSAO_ORCAMENTO', 'ORC_DATA_ORCAMENTO', 'CODIGO_PRODUTO_ORC',
  'ORC_NUMERO_ORCAMENTO', 'ORC_SALDO_ORCAMENTO', 'ORC_VALOR_UNITARIO',
  'ORC_VALOR_TOTAL', 'ORC_CUSTO_PRODUTO', 'ORC_CODIGO_VENDEDOR',
  'ORC_NOME_VENDEDOR', 'Status', 'STATUS_OVERRIDE', 'updated_at'
].join(',');

// ATENÇÃO: a tabela crm_parquemaquinas NÃO tem coluna CODIGO_CLIENTE.
// O campo correto é COD_CLIENTE (vide dicionário de dados do ERP).
const COLS_MAQUINAS = [
  'id', 'FILIAL', 'FABRICANTE', 'MODELO', 'CATEGORIA', 'ESTADO',
  'CHASSI', 'REGIAO', 'COD_VENDEDOR', 'NOME_VENDEDOR', 'EMISSAO',
  'NOTA_FISCAL', 'COD_CLIENTE', 'LOJA_CLIENTE',
  'NOME_CLIENTE', 'MUNICIPIO', 'UF_MUN_CLIENTE', 'TOTAL'
].join(',');

// ---------------------------------------------------------------------------
// fetchAll genérico — busca tabela inteira com paginação + concurrency limitada.
// Usa cliente autenticado: RLS filtra automaticamente pelo escopo do user.
// ---------------------------------------------------------------------------
async function fetchAll(
  supabase: SupabaseClient,
  tableName: string,
  columns: string,
  orderCol: string
): Promise<any[]> {
  const { count, error: countError } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  if (countError) throw countError;

  const total = count || 0;
  if (total === 0) return [];

  const step = 999;
  const numRequests = Math.ceil(total / step);

  const CONCURRENCY = 5;
  let allData: any[] = [];

  for (let batch = 0; batch < numRequests; batch += CONCURRENCY) {
    const batchPromises = [];
    for (let i = batch; i < Math.min(batch + CONCURRENCY, numRequests); i++) {
      const from = i * step;
      batchPromises.push(
        supabase
          .from(tableName)
          .select(columns)
          .order(orderCol, { ascending: false, nullsFirst: false })
          .order('id', { ascending: true })
          .range(from, from + step - 1)
      );
    }
    const results = await Promise.all(batchPromises);
    for (const result of results) {
      if (result.error) throw result.error;
      if (result.data) allData = allData.concat(result.data);
    }
  }

  return allData;
}

// ---------------------------------------------------------------------------
// fetchOrcamentosRecentes — só os orçamentos dos últimos 365 dias (RLS aplica).
// ---------------------------------------------------------------------------
async function fetchOrcamentosRecentes(supabase: SupabaseClient): Promise<any[]> {
  const umAnoAtras = new Date();
  umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
  const dataCorte = umAnoAtras.toISOString().split('T')[0];

  const { count, error: cErr } = await supabase
    .from('crm_orcamentos')
    .select('*', { count: 'exact', head: true })
    .gte('ORC_DATA_EMISSAO_ORCAMENTO', dataCorte);

  if (cErr) throw cErr;
  const total = count || 0;
  if (total === 0) return [];

  const step = 999;
  const numReqs = Math.ceil(total / step);
  let data: any[] = [];

  for (let i = 0; i < numReqs; i += 5) {
    const batch = [];
    for (let j = i; j < Math.min(i + 5, numReqs); j++) {
      const from = j * step;
      batch.push(
        supabase
          .from('crm_orcamentos')
          .select(COLS_ORCAMENTOS)
          .gte('ORC_DATA_EMISSAO_ORCAMENTO', dataCorte)
          .order('ORC_VALOR_TOTAL', { ascending: false, nullsFirst: false })
          .range(from, from + step - 1)
      );
    }
    const results = await Promise.all(batch);
    for (const r of results) {
      if (r.error) throw r.error;
      if (r.data) data = data.concat(r.data);
    }
  }

  return data;
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tabela = searchParams.get('tabela') || 'clientes';

    switch (tabela) {
      case 'clientes':
      case 'crm_clientes': {
        const data = await fetchAll(supabase, 'crm_clientes', COLS_CLIENTES, 'DIAS_SEM_COMPRA');
        return NextResponse.json(data);
      }
      case 'orcamentos':
      case 'crm_orcamentos': {
        const data = await fetchOrcamentosRecentes(supabase);
        return NextResponse.json(data);
      }
      case 'maquinas':
      case 'crm_parquemaquinas': {
        const data = await fetchAll(supabase, 'crm_parquemaquinas', COLS_MAQUINAS, 'TOTAL');
        return NextResponse.json(data);
      }
      case 'resumo': {
        const [cli, orc, maq] = await Promise.all([
          supabase.from('crm_clientes').select('id', { count: 'exact', head: true }),
          supabase.from('crm_orcamentos').select('id', { count: 'exact', head: true }),
          supabase.from('crm_parquemaquinas').select('id', { count: 'exact', head: true }),
        ]);
        return NextResponse.json({
          clientes: cli.count || 0,
          orcamentos: orc.count || 0,
          maquinas: maq.count || 0,
        });
      }
      default:
        return NextResponse.json({ error: 'Tabela inválida', recebido: tabela }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
