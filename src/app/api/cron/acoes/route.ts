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

    // 1. Buscar ações automáticas que já estão pendentes (evitar duplicadas de execuções anteriores).
    // IMPORTANTE: paginar. O .select() do Supabase capa em 1000 linhas por padrão — quando a fila
    // de ações automáticas passa de 1000, o dedup abaixo fica cego e recria as mesmas ações todo dia
    // (foi o que gerou ~17 mil duplicatas de resgate de churn). A paginação garante ver TODAS.
    const acoesPendentes: any[] = [];
    {
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error: errAcoes } = await supabase
          .from('crm_acoes')
          .select('codigo_cliente, loja_cliente, numero_orcamento, tipo')
          .in('status', ['PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA'])
          .eq('origem', 'SISTEMA_AUTO')
          .range(from, from + PAGE - 1);
        if (errAcoes) {
          throw new Error(`Erro ao buscar ações pendentes: ${errAcoes.message}`);
        }
        acoesPendentes.push(...(data || []));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
    }

    // --- REGRA 1: EVASÃO DE CLIENTES (CHURN) ---
    // Pagina + filtra no servidor (só quem já está no gatilho de churn, > 120 dias).
    // Antes capava em 1000 (de ~1668 ativos) e clientes lapsados ficavam sem ação de resgate.
    const clientes: any[] = [];
    {
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error: errClientes } = await supabase
          .from('crm_clientes')
          .select('CODIGO_CLIENTE, LOJA_CLIENTE, NOME_CLIENTE, VENDEDOR_RESP, NOME_VENDEDOR_RESP, DIAS_SEM_COMPRA')
          .eq('STATUS_BASE', 'ATIVO')
          .gt('DIAS_SEM_COMPRA', 120)
          .range(from, from + PAGE - 1);
        if (errClientes) { console.error("Erro ao buscar clientes:", errClientes); break; }
        clientes.push(...(data || []));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
    }
    {
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
    // Só orçamentos RECENTES interessam às regras 2 e 3 — filtra no servidor + pagina.
    // (O .select sem range capa em 1000; a base tem ~160k, então antes só varria 1k.)
    //  - REGRA 2 (follow-up): emitidos nos últimos 45 dias (a regra olha 15–45 dias por emissão);
    //  - REGRA 3 (reativação): validade (ORC_DATA_ORCAMENTO) nos últimos 30 dias.
    const hojeFiltro = new Date();
    const lim45 = new Date(hojeFiltro); lim45.setDate(lim45.getDate() - 45);
    const lim30 = new Date(hojeFiltro); lim30.setDate(lim30.getDate() - 30);
    const fmtData = (d: Date) => d.toISOString().split('T')[0];
    const COLS_ORC = 'ORC_NUMERO_ORCAMENTO, ORC_DATA_EMISSAO_ORCAMENTO, ORC_DATA_ORCAMENTO, ORC_VALOR_TOTAL, Status, STATUS_OVERRIDE, CODIGO_CLIENTE, LOJA_CLIENTE, CLIENTE_ORC, ORC_CODIGO_VENDEDOR, ORC_NOME_VENDEDOR';
    const orcamentos: any[] = [];
    let errOrcamentos: any = null;
    {
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('crm_orcamentos')
          .select(COLS_ORC)
          .or(`ORC_DATA_EMISSAO_ORCAMENTO.gte.${fmtData(lim45)},ORC_DATA_ORCAMENTO.gte.${fmtData(lim30)}`)
          .range(from, from + PAGE - 1);
        if (error) { errOrcamentos = error; break; }
        orcamentos.push(...(data || []));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
    }

    if (errOrcamentos) {
      console.error("Erro ao buscar orçamentos:", errOrcamentos);
    } else {
      const hoje = new Date();
      for (const o of orcamentos) {
        // ----- REGRA 2: follow-up em orçamentos abertos esfriando -----
        // Só ABERTO: não faz sentido "dar follow-up" em orçamento já FATURADO (ganho).
        // CANCELADO/VENCIDO são tratados pela REGRA 3 (reativação) — evita ação dobrada.
        const statusR2 = String(o.STATUS_OVERRIDE || o.Status || '').toUpperCase().trim();
        const abertoR2 = statusR2 === 'ABERTO' || statusR2 === 'EM ABERTO' || statusR2 === '';
        if (abertoR2 && o.ORC_DATA_EMISSAO_ORCAMENTO) {
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
