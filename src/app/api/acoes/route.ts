import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { registrarAtividade } from '@/lib/atividade';

export const dynamic = 'force-dynamic';

// Retorna { seeAll, codVendedores } do user autenticado.
// Usa o admin client porque RLS de profiles bloqueia leitura do próprio profile
// se você não passar pelas helpers — e a função SECURITY DEFINER é mais barata
// no SQL. Aqui no node lemos direto.
async function getUserScope(userId: string): Promise<{
  seeAll: boolean;
  codVendedores: string[];
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('profiles')
    .select('role, cod_vendedor')
    .eq('id', userId)
    .single();
  return {
    // ADMIN e COORDENADOR agem sobre ações de qualquer vendedor; USER só do seu escopo.
    seeAll: data?.role === 'ADMIN' || data?.role === 'COORDENADOR',
    codVendedores: (data?.cod_vendedor as string[] | null) ?? [],
  };
}

// GET — Lista ações com filtros. RLS limita ao escopo do user no DB.
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const vendedor = searchParams.get('vendedor');
    const status = searchParams.get('status');
    const prioridade = searchParams.get('prioridade');
    const cliente = searchParams.get('codigo_cliente');

    // Monta a query (com filtros) para uma página. Precisa ser refeita por página
    // porque o query builder do supabase-js é de uso único.
    const buildQuery = (fromIdx: number, toIdx: number) => {
      let q = supabase
        .from('crm_acoes')
        .select('*')
        .order('data_vencimento', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(fromIdx, toIdx);
      if (vendedor) q = q.eq('vendedor_responsavel', vendedor);
      if (status) {
        if (status === 'ATIVAS') q = q.in('status', ['PENDENTE', 'EM_ANDAMENTO']);
        else q = q.eq('status', status);
      }
      if (prioridade) q = q.eq('prioridade', prioridade);
      if (cliente) q = q.eq('codigo_cliente', cliente);
      return q;
    };

    // Pagina: o .select() do supabase capa em 1000 linhas. Sem isto, ações com
    // vencimento mais distante (ordenadas por último) somem do painel — foi o caso
    // de ações recém-criadas com data futura não aparecerem.
    const all: any[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await buildQuery(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }

    return NextResponse.json(all);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — Cria nova ação. Valida que o vendedor_responsavel está no escopo do user.
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const vendedorResp = body.vendedor_responsavel || null;

    const scope = await getUserScope(user.id);
    if (!scope.seeAll) {
      if (!vendedorResp) {
        return NextResponse.json(
          { error: 'Vendedor responsável é obrigatório.' },
          { status: 400 },
        );
      }
      if (!scope.codVendedores.includes(vendedorResp)) {
        return NextResponse.json(
          { error: 'Você não pode criar ações para este vendedor.' },
          { status: 403 },
        );
      }
    }

    const admin = createAdminClient();

    // Filial/empresa do cadastro (01/05/10/15), quando o par código+loja resolve sem ambiguidade
    let filialCliente: string | null = null;
    if (body.codigo_cliente && body.loja_cliente) {
      const { data: cads } = await admin
        .from('crm_clientes')
        .select('FILIAL')
        .eq('CODIGO_CLIENTE', body.codigo_cliente)
        .eq('LOJA_CLIENTE', body.loja_cliente)
        .limit(10);
      const filiais = [...new Set((cads || []).map((c: any) => c.FILIAL).filter(Boolean))];
      if (filiais.length === 1) filialCliente = filiais[0];
    }

    const acao = {
      tipo: body.tipo || 'OUTRO',
      titulo: body.titulo,
      descricao: body.descricao || null,
      prioridade: body.prioridade || 'MEDIA',
      status: 'PENDENTE',
      codigo_cliente: body.codigo_cliente || null,
      loja_cliente: body.loja_cliente || null,
      nome_cliente: body.nome_cliente || null,
      filial_cliente: filialCliente,
      numero_orcamento: body.numero_orcamento || null,
      vendedor_responsavel: vendedorResp,
      nome_vendedor: body.nome_vendedor || null,
      criado_por: body.criado_por || 'GESTOR',
      data_vencimento: body.data_vencimento || null,
      origem: body.origem || 'MANUAL',
      data_criacao: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from('crm_acoes')
      .insert(acao)
      .select()
      .single();

    if (error) throw error;

    registrarAtividade({
      userId: user.id,
      userEmail: user.email,
      vendedorCod: vendedorResp,
      evento: 'CRIAR_ACAO',
      detalhe: data?.titulo || acao.titulo,
      codigoCliente: acao.codigo_cliente,
      numeroOrcamento: acao.numero_orcamento,
    });

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
