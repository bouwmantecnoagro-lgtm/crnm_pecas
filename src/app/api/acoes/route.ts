import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Retorna { isAdmin, codVendedores } do user autenticado.
// Usa o admin client porque RLS de profiles bloqueia leitura do próprio profile
// se você não passar pelas helpers — e a função SECURITY DEFINER é mais barata
// no SQL. Aqui no node lemos direto.
async function getUserScope(userId: string): Promise<{
  isAdmin: boolean;
  codVendedores: string[];
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('profiles')
    .select('role, cod_vendedor')
    .eq('id', userId)
    .single();
  return {
    isAdmin: data?.role === 'ADMIN',
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

    let query = supabase
      .from('crm_acoes')
      .select('*')
      .order('data_vencimento', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (vendedor) query = query.eq('vendedor_responsavel', vendedor);
    if (status) {
      if (status === 'ATIVAS') {
        query = query.in('status', ['PENDENTE', 'EM_ANDAMENTO']);
      } else {
        query = query.eq('status', status);
      }
    }
    if (prioridade) query = query.eq('prioridade', prioridade);
    if (cliente) query = query.eq('codigo_cliente', cliente);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data || []);
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
    if (!scope.isAdmin) {
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
    const acao = {
      tipo: body.tipo || 'OUTRO',
      titulo: body.titulo,
      descricao: body.descricao || null,
      prioridade: body.prioridade || 'MEDIA',
      status: 'PENDENTE',
      codigo_cliente: body.codigo_cliente || null,
      loja_cliente: body.loja_cliente || null,
      nome_cliente: body.nome_cliente || null,
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

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
