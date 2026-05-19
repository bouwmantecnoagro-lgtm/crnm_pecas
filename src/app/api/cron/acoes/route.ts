import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
  // Segurança Básica: Validar se a chamada vem do Vercel Cron
  // Em prod no Vercel, o Vercel passa o CRON_SECRET no cabeçalho de autorização.
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  // Se existir um CRON_SECRET configurado nas variáveis de ambiente, exigimos ele.
  // Permite testes locais (se o secret não estiver definido ou via Postman/Curl).
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    let acoesCriadas = 0;
    
    // Conjuntos para evitar duplicadas durante a MESMA execução do robô
    const clientesProcessados = new Set();
    const orcamentosProcessados = new Set();
    const orcamentosReativacao = new Set();

    // 1. Buscar ações automáticas que já estão pendentes (evitar duplicadas de execuções anteriores)
    const { data: acoesPendentes, error: errAcoes } = await supabase
      .from('crm_acoes')
      .select('codigo_cliente, loja_cliente, numero_orcamento, tipo')
      .in('status', ['PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA'])
      .eq('origem', 'SISTEMA_AUTO');

    if (errAcoes) {
      throw new Error(`Erro ao buscar ações pendentes: ${errAcoes.message}`);
    }

    // --- REGRA 1: EVASÃO DE CLIENTES (CHURN) ---
    const { data: clientes, error: errClientes } = await supabase
      .from('crm_clientes')
      .select('CODIGO_CLIENTE, LOJA_CLIENTE, NOME_CLIENTE, VENDEDOR_RESP, NOME_VENDEDOR_RESP, DIAS_SEM_COMPRA')
      .eq('STATUS_BASE', 'ATIVO')
      .not('DIAS_SEM_COMPRA', 'is', null);

    if (errClientes) {
      console.error("Erro ao buscar clientes:", errClientes);
    } else {
      for (const c of clientes) {
        if (c.DIAS_SEM_COMPRA > 120) {
          const cliId = `${c.CODIGO_CLIENTE}_${c.LOJA_CLIENTE}`;
          if (clientesProcessados.has(cliId)) continue;

          // Verifica se já existe uma ação de resgate (LIGAR) para ele
          const jaExiste = acoesPendentes?.some(a => 
            String(a.codigo_cliente) === String(c.CODIGO_CLIENTE) && 
            String(a.loja_cliente) === String(c.LOJA_CLIENTE) && 
            a.tipo === 'LIGAR'
          );

          if (!jaExiste) {
            clientesProcessados.add(cliId);
            const payload = {
              titulo: `Resgate de Inatividade (${c.DIAS_SEM_COMPRA} dias)`,
              tipo: 'LIGAR',
              prioridade: c.DIAS_SEM_COMPRA > 90 ? 'URGENTE' : 'ALTA',
              descricao: `Cliente ativo sem fluxo financeiro há ${c.DIAS_SEM_COMPRA} dias.\nReative o relacionamento e identifique o motivo do afastamento.`,
              codigo_cliente: c.CODIGO_CLIENTE,
              loja_cliente: c.LOJA_CLIENTE,
              nome_cliente: c.NOME_CLIENTE,
              vendedor_responsavel: c.VENDEDOR_RESP,
              nome_vendedor: c.NOME_VENDEDOR_RESP,
              origem: 'SISTEMA_AUTO',
              criado_por: 'SISTEMA',
              data_vencimento: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // +2 dias
            };

            const { error } = await supabase.from('crm_acoes').insert(payload);
            if (!error) acoesCriadas++;
          }
        }
      }
    }

    // --- REGRA 2: PIPELINE COMERCIAL (FOLLOW-UP) ---
    // --- REGRA 3: REATIVAÇÃO de orçamentos cancelados/vencidos nos últimos 30 dias ---
    const { data: orcamentos, error: errOrcamentos } = await supabase
      .from('crm_orcamentos')
      .select('*');

    if (errOrcamentos) {
      console.error("Erro ao buscar orçamentos:", errOrcamentos);
    } else {
      const hoje = new Date();
      for (const o of orcamentos) {
        // ----- REGRA 2: follow-up em orçamentos abertos esfriando -----
        if (o.ORC_DATA_EMISSAO_ORCAMENTO) {
          const dataEmissao = new Date(o.ORC_DATA_EMISSAO_ORCAMENTO);
          const diasAberto = Math.floor((hoje.getTime() - dataEmissao.getTime()) / (1000 * 60 * 60 * 24));

          if (diasAberto > 15 && diasAberto < 45) {
            if (!orcamentosProcessados.has(o.ORC_NUMERO_ORCAMENTO)) {
              const jaExiste = acoesPendentes?.some(a =>
                String(a.numero_orcamento) === String(o.ORC_NUMERO_ORCAMENTO) &&
                a.tipo === 'FOLLOW_UP_ORCAMENTO'
              );

              if (!jaExiste) {
                orcamentosProcessados.add(o.ORC_NUMERO_ORCAMENTO);
                const payload = {
                  titulo: `Follow-up de Orçamento Esfriando (#${o.ORC_NUMERO_ORCAMENTO})`,
                  tipo: 'FOLLOW_UP_ORCAMENTO',
                  prioridade: (o.ORC_VALOR_TOTAL || 0) > 5000 ? 'ALTA' : 'MEDIA',
                  descricao: `O orçamento nº ${o.ORC_NUMERO_ORCAMENTO} no valor de R$ ${o.ORC_VALOR_TOTAL || 0} já tem ${diasAberto} dias.\nLigue para o cliente e tente o fechamento comercial.`,
                  codigo_cliente: o.CODIGO_CLIENTE,
                  loja_cliente: o.LOJA_CLIENTE,
                  nome_cliente: o.CLIENTE_ORC,
                  numero_orcamento: String(o.ORC_NUMERO_ORCAMENTO),
                  vendedor_responsavel: o.ORC_CODIGO_VENDEDOR,
                  nome_vendedor: o.ORC_NOME_VENDEDOR,
                  origem: 'SISTEMA_AUTO',
                  criado_por: 'SISTEMA',
                  data_vencimento: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // +1 dia
                };

                const { error } = await supabase.from('crm_acoes').insert(payload);
                if (!error) acoesCriadas++;
              }
            }
          }
        }

        // ----- REGRA 3: reativação de orçamentos VENCIDOS ou CANCELADOS recentes -----
        // STATUS_OVERRIDE indica cancelamento via CRM (vendedor já marcou "Sem Interesse") — não retorna o tema pra ele.
        if (!o.STATUS_OVERRIDE) {
          const statusErp = String(o.Status || o.STATUS || '').toUpperCase().trim();
          if ((statusErp === 'VENCIDO' || statusErp === 'CANCELADO') && o.ORC_DATA_ORCAMENTO) {
            const dataRef = new Date(String(o.ORC_DATA_ORCAMENTO) + 'T00:00:00');
            const diasDesde = Math.floor((hoje.getTime() - dataRef.getTime()) / (1000 * 60 * 60 * 24));

            if (diasDesde >= 0 && diasDesde <= 30) {
              if (!orcamentosReativacao.has(o.ORC_NUMERO_ORCAMENTO)) {
                const jaExiste = acoesPendentes?.some(a =>
                  String(a.numero_orcamento) === String(o.ORC_NUMERO_ORCAMENTO) &&
                  a.tipo === 'REATIVACAO_ORCAMENTO'
                );

                if (!jaExiste) {
                  orcamentosReativacao.add(o.ORC_NUMERO_ORCAMENTO);
                  const motivo = statusErp === 'VENCIDO' ? 'venceu' : 'foi cancelado';
                  const payload = {
                    titulo: `Reativar Orçamento ${statusErp} (#${o.ORC_NUMERO_ORCAMENTO})`,
                    tipo: 'REATIVACAO_ORCAMENTO',
                    prioridade: 'ALTA',
                    descricao: `O orçamento nº ${o.ORC_NUMERO_ORCAMENTO} (R$ ${o.ORC_VALOR_TOTAL || 0}) ${motivo} há ${diasDesde} dia(s).\nContate o cliente e tente reativar a oferta — janela ainda quente.`,
                    codigo_cliente: o.CODIGO_CLIENTE,
                    loja_cliente: o.LOJA_CLIENTE,
                    nome_cliente: o.CLIENTE_ORC,
                    numero_orcamento: String(o.ORC_NUMERO_ORCAMENTO),
                    vendedor_responsavel: o.ORC_CODIGO_VENDEDOR,
                    nome_vendedor: o.ORC_NOME_VENDEDOR,
                    origem: 'SISTEMA_AUTO',
                    criado_por: 'SISTEMA',
                    data_vencimento: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // +2 dias
                  };

                  const { error } = await supabase.from('crm_acoes').insert(payload);
                  if (!error) acoesCriadas++;
                }
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Processo finalizado. ${acoesCriadas} novas ações automáticas geradas.`
    });

  } catch (error: any) {
    console.error("Erro no cron:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
