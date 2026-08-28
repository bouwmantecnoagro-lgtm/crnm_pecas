import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { chaveCliente, filialDe } from '@/lib/acao';

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
          .select('codigo_cliente, loja_cliente, filial_cliente, numero_orcamento, tipo')
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
          .select('FILIAL, CODIGO_CLIENTE, LOJA_CLIENTE, NOME_CLIENTE, VENDEDOR_RESP, NOME_VENDEDOR_RESP, DIAS_SEM_COMPRA, CNPJ_RAIZ')
          .eq('STATUS_BASE', 'ATIVO')
          .gt('DIAS_SEM_COMPRA', 120)
          .range(from, from + PAGE - 1);
        if (errClientes) { console.error("Erro ao buscar clientes:", errClientes); break; }
        clientes.push(...(data || []));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
    }

    // Cadastro de TODA a base, indexado pelo par (código, loja) normalizado.
    // Dois detalhes que já morderam aqui:
    //   1. crm_clientes guarda TEXTO com zeros à esquerda ('003193', '01') e crm_acoes
    //      guarda NÚMERO (3193, 1) — a coluna é inteira e come o zero no insert. Sem o
    //      padStart os dois lados nunca casam (era o que cegava o dedup e o cooldown).
    //   2. O par (código, loja) NÃO é único: repete entre as empresas 01/05/10/15 com
    //      clientes DIFERENTES (000038/01 é LAERTE na 01 e RODRIGO BAGATINI na 10). São
    //      414 pares repetidos. Por isso `cadastroDaAcao` exige a filial quando há mais
    //      de um candidato — e devolve null na dúvida, em vez de chutar o cliente errado.
    const cadastrosPorPar = new Map<string, any[]>();
    {
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('crm_clientes')
          .select('FILIAL, CODIGO_CLIENTE, LOJA_CLIENTE, CNPJ_RAIZ, VENDEDOR_RESP, NOME_VENDEDOR_RESP')
          .range(from, from + PAGE - 1);
        if (error) { console.error("Erro ao mapear cadastros de clientes:", error); break; }
        for (const c of data || []) {
          const key = chaveCliente(c.CODIGO_CLIENTE, c.LOJA_CLIENTE);
          const lista = cadastrosPorPar.get(key);
          if (lista) lista.push(c); else cadastrosPorPar.set(key, [c]);
        }
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
    }

    // Cadastro dono de uma ação, ou null quando o par é ambíguo e a ação não diz a filial.
    const cadastroDaAcao = (acao: any) => {
      if (acao?.codigo_cliente == null) return null;
      const cands = cadastrosPorPar.get(chaveCliente(acao.codigo_cliente, acao.loja_cliente));
      if (!cands?.length) return null;
      if (cands.length === 1) return cands[0];
      const fil = filialDe(acao.filial_cliente);
      if (!fil) return null;
      return cands.find((c: any) => filialDe(c.FILIAL) === fil) || null;
    };

    // Grupo (CNPJ_RAIZ) do cadastro. Quando a ação não resolve para um cadastro, usa uma
    // chave própria dela — nunca a chave "código_loja" crua, que juntaria no mesmo grupo
    // clientes distintos de filiais diferentes e faria o dedup apagar a ação do vizinho.
    const grupoDoCadastro = (c: any) => c.CNPJ_RAIZ || chaveCliente(c.CODIGO_CLIENTE, c.LOJA_CLIENTE);
    const grupoDaAcao = (acao: any) => {
      const c = cadastroDaAcao(acao);
      if (c) return grupoDoCadastro(c);
      return `AMBIGUO_${chaveCliente(acao?.codigo_cliente, acao?.loja_cliente)}_${filialDe(acao?.filial_cliente) ?? '??'}`;
    };

    // --- PASSO 0: AÇÕES SEGUEM A CARTEIRA ---
    // vendedor_responsavel é uma cópia do dono do cliente no instante em que a ação nasce.
    // Quando a carteira troca de mãos no Protheus o cadastro muda, mas a ação fica no
    // vendedor antigo — e some do painel do novo, porque o RLS filtra por esse campo.
    // Realinha antes de gerar qualquer coisa. Só mexe no que está em aberto: ação concluída
    // é histórico de quem executou e não pode mudar de dono.
    let acoesReatribuidas = 0;
    {
      const abertas: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('crm_acoes')
          .select('id, codigo_cliente, loja_cliente, filial_cliente, vendedor_responsavel')
          .in('status', ['PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA'])
          .range(from, from + PAGE - 1);
        if (error) { console.error("Erro ao buscar ações abertas:", error); break; }
        abertas.push(...(data || []));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }

      // Agrupa por vendedor de destino: um update por lote de ids, não um por ação.
      const porDestino = new Map<string, { cod: string; nome: string; ids: string[] }>();
      for (const a of abertas) {
        const cad = cadastroDaAcao(a);
        if (!cad?.VENDEDOR_RESP) continue;
        const cod = String(cad.VENDEDOR_RESP).trim();
        if (cod === String(a.vendedor_responsavel ?? '').trim()) continue;
        if (!porDestino.has(cod)) porDestino.set(cod, { cod, nome: cad.NOME_VENDEDOR_RESP, ids: [] });
        porDestino.get(cod)!.ids.push(a.id);
      }

      for (const destino of porDestino.values()) {
        for (let i = 0; i < destino.ids.length; i += 200) {
          const lote = destino.ids.slice(i, i + 200);
          const { error } = await supabase
            .from('crm_acoes')
            .update({ vendedor_responsavel: destino.cod, nome_vendedor: destino.nome })
            .in('id', lote);
          if (error) console.error(`Erro ao reatribuir ações para ${destino.cod}:`, error);
          else acoesReatribuidas += lote.length;
        }
      }
    }

    // --- PASSO 0.5: FOLLOW-UP MORRE JUNTO COM O ORÇAMENTO ---
    // Follow-up de orçamento existe para fechar a venda. Quando o orçamento é CANCELADO
    // (no Protheus, ou via "Sem Interesse" no CRM → STATUS_OVERRIDE), o card não pode
    // continuar Pendente no painel — vai para CANCELADA, com o motivo no `resultado`.
    // Só mexe em FOLLOW_UP_ORCAMENTO: REATIVACAO_ORCAMENTO existe JUSTAMENTE para
    // orçamento cancelado/vencido (REGRA 3) e não pode ser encerrada por esta regra.
    let followUpsCancelados = 0;
    {
      // Follow-ups em aberto com orçamento vinculado — do robô ou criados à mão.
      const followUps: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('crm_acoes')
          .select('id, numero_orcamento, filial_cliente, codigo_cliente, loja_cliente')
          .eq('tipo', 'FOLLOW_UP_ORCAMENTO')
          .in('status', ['PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA'])
          .not('numero_orcamento', 'is', null)
          .range(from, from + PAGE - 1);
        if (error) { console.error('Erro ao buscar follow-ups em aberto:', error); break; }
        followUps.push(...(data || []));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }

      // Status efetivo (override do CRM > ERP) de cada linha dos orçamentos vinculados.
      // O número NÃO identifica o orçamento sozinho: repete entre empresas E recicla entre
      // lojas/anos na mesma empresa (#00008426 é um cliente em 010203/2026 e OUTRO em
      // 010201/2022). Por isso cada linha guarda filial e cliente para o desempate abaixo.
      const linhasPorNumero = new Map<string, { fil: string | null; cli: string; st: string }[]>();
      const numeros = [...new Set(followUps.map(a => String(a.numero_orcamento)))];
      for (let i = 0; i < numeros.length; i += 200) {
        const chunk = numeros.slice(i, i + 200);
        // Pagina DENTRO do chunk: 200 números podem ter bem mais de 1000 linhas (há
        // orçamento com 40+ produtos) e o PostgREST capa a resposta em 1000 — sem o
        // range, linhas ABERTO ficavam de fora e o orçamento parecia "todo cancelado".
        let fromOrc = 0;
        while (true) {
          const { data, error } = await supabase
            .from('crm_orcamentos')
            .select('FILIAL_ORC, ORC_NUMERO_ORCAMENTO, CODIGO_CLIENTE, LOJA_CLIENTE, Status, STATUS_OVERRIDE')
            .in('ORC_NUMERO_ORCAMENTO', chunk)
            .order('id') // ordem estável — paginar sem ORDER BY pode pular linhas entre páginas
            .range(fromOrc, fromOrc + PAGE - 1);
          if (error) { console.error('Erro ao buscar status dos orçamentos vinculados:', error); break; }
          for (const o of data || []) {
            const num = String(o.ORC_NUMERO_ORCAMENTO);
            if (!linhasPorNumero.has(num)) linhasPorNumero.set(num, []);
            linhasPorNumero.get(num)!.push({
              fil: filialDe(o.FILIAL_ORC),
              cli: chaveCliente(o.CODIGO_CLIENTE, o.LOJA_CLIENTE),
              st: String(o.STATUS_OVERRIDE || o.Status || '').toUpperCase().trim(),
            });
          }
          if (!data || data.length < PAGE) break;
          fromOrc += PAGE;
        }
      }

      const idsCancelar: string[] = [];
      for (const a of followUps) {
        let linhas = linhasPorNumero.get(String(a.numero_orcamento)) ?? [];
        const fil = filialDe(a.filial_cliente);
        if (fil) linhas = linhas.filter(l => l.fil === fil);
        if (a.codigo_cliente != null) {
          const cli = chaveCliente(a.codigo_cliente, a.loja_cliente);
          linhas = linhas.filter(l => l.cli === cli);
        }
        // Sem linha do orçamento (não sincronizado ou removido no cleanup) → não mexe.
        // Cancelado como um todo: TODAS as linhas (uma por produto) canceladas.
        // Cancel.Parcial no Protheus deixa itens vivos — aí o follow-up continua valendo.
        if (linhas.length > 0 && linhas.every(l => l.st === 'CANCELADO')) idsCancelar.push(a.id);
      }

      for (let i = 0; i < idsCancelar.length; i += 200) {
        const lote = idsCancelar.slice(i, i + 200);
        const { error } = await supabase
          .from('crm_acoes')
          .update({
            status: 'CANCELADA',
            resultado: 'ORCAMENTO_CANCELADO',
            updated_at: new Date().toISOString(),
          })
          .in('id', lote);
        if (error) console.error('Erro ao cancelar follow-ups de orçamentos cancelados:', error);
        else followUpsCancelados += lote.length;
      }
    }

    // Grupos que já têm resgate (LIGAR) pendente em QUALQUER cadastro — antes o dedup era
    // por cadastro (código+loja) e o mesmo cliente com 2 cadastros ganhava 2 ações.
    const pendenteLigarGrupo = new Set<string>();
    for (const a of acoesPendentes) {
      if (a.tipo === 'LIGAR') pendenteLigarGrupo.add(grupoDaAcao(a));
    }

    // Cooldown: se um resgate do grupo foi CONCLUÍDO/CANCELADO há menos de 90 dias, não
    // recria — antes o robô recriava no dia seguinte ao desfecho ("ligar quase todo dia").
    const COOLDOWN_RESGATE_DIAS = 90;
    const cooldownGrupo = new Set<string>();
    {
      const cutoff = new Date(Date.now() - COOLDOWN_RESGATE_DIAS * 24 * 60 * 60 * 1000).toISOString();
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('crm_acoes')
          .select('codigo_cliente, loja_cliente, filial_cliente')
          .eq('origem', 'SISTEMA_AUTO')
          .eq('tipo', 'LIGAR')
          .in('status', ['CONCLUIDA', 'CANCELADA'])
          .or(`data_conclusao.gte.${cutoff},updated_at.gte.${cutoff}`)
          .range(from, from + PAGE - 1);
        if (error) { console.error("Erro ao buscar resgates com desfecho recente:", error); break; }
        for (const a of data || []) cooldownGrupo.add(grupoDaAcao(a));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
    }

    // Recência consolidada por grupo (CNPJ_RAIZ): se o cliente comprou em OUTRA filial
    // nos últimos 120 dias, ele NÃO é evasão — não gera tarefa de resgate (falso churn).
    // A view ignora RLS; aqui rodamos com service_role, então enxerga tudo de qualquer jeito.
    const recenciaGrupo = new Map<string, number>();
    {
      const { data: grupos } = await supabase
        .from('crm_recencia_grupo')
        .select('cnpj_raiz, dias_grupo');
      for (const g of grupos || []) {
        if (g.dias_grupo != null) recenciaGrupo.set(g.cnpj_raiz, g.dias_grupo);
      }
    }
    {
      // Agrupa elegíveis por CNPJ_RAIZ: UMA ação de resgate por cliente-grupo,
      // não uma por cadastro/empresa (era o que duplicava p/ quem existe na 01 e na 10).
      const elegiveisPorGrupo = new Map<string, any[]>();
      for (const c of clientes) {
        const g = grupoDoCadastro(c);
        if (!elegiveisPorGrupo.has(g)) elegiveisPorGrupo.set(g, []);
        elegiveisPorGrupo.get(g)!.push(c);
      }

      for (const [grupo, cadastros] of elegiveisPorGrupo) {
        // dias efetivo = menor entre os cadastros elegíveis e a compra mais recente do grupo
        const menorLocal = Math.min(...cadastros.map((c: any) => c.DIAS_SEM_COMPRA));
        const diasGrupo = recenciaGrupo.get(grupo);
        const diasEfetivo = (diasGrupo != null && diasGrupo < menorLocal) ? diasGrupo : menorLocal;
        if (diasEfetivo <= 120) continue;
        if (pendenteLigarGrupo.has(grupo)) continue;
        if (cooldownGrupo.has(grupo)) continue;

        // Representante do grupo: o cadastro com a atividade mais recente
        const rep = cadastros.reduce((a: any, b: any) => (b.DIAS_SEM_COMPRA < a.DIAS_SEM_COMPRA ? b : a));

        const payload = {
          titulo: `Resgate de Inatividade (${diasEfetivo} dias)`,
          tipo: 'LIGAR',
          prioridade: diasEfetivo > 90 ? 'URGENTE' : 'ALTA',
          descricao: `Cliente ativo sem fluxo financeiro há ${diasEfetivo} dias (considerando todas as filiais do grupo).\nReative o relacionamento e identifique o motivo do afastamento.`,
          codigo_cliente: rep.CODIGO_CLIENTE,
          loja_cliente: rep.LOJA_CLIENTE,
          nome_cliente: rep.NOME_CLIENTE,
          filial_cliente: rep.FILIAL || null,
          vendedor_responsavel: rep.VENDEDOR_RESP,
          nome_vendedor: rep.NOME_VENDEDOR_RESP,
          origem: 'SISTEMA_AUTO',
          criado_por: 'SISTEMA',
          data_vencimento: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // +2 dias
        };

        const { error } = await supabase.from('crm_acoes').insert(payload);
        if (!error) {
          acoesCriadas++;
          pendenteLigarGrupo.add(grupo);
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
    // FILIAL_ORC entra para carimbar a empresa na ação: sem ela, uma ação de orçamento
    // com código+loja repetido entre filiais não tem como ser ligada ao cliente certo.
    const COLS_ORC = 'FILIAL_ORC, ORC_NUMERO_ORCAMENTO, ORC_DATA_EMISSAO_ORCAMENTO, ORC_DATA_ORCAMENTO, ORC_VALOR_TOTAL, Status, STATUS_OVERRIDE, CODIGO_CLIENTE, LOJA_CLIENTE, CLIENTE_ORC, ORC_CODIGO_VENDEDOR, ORC_NOME_VENDEDOR';
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
                  filial_cliente: filialDe(o.FILIAL_ORC),
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
                    filial_cliente: filialDe(o.FILIAL_ORC),
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
      message: `Processo finalizado. ${acoesCriadas} novas ações automáticas geradas, ${acoesReatribuidas} realinhadas com a carteira atual, ${followUpsCancelados} follow-ups cancelados (orçamento cancelado).`
    });

  } catch (error: any) {
    console.error("Erro no cron:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
