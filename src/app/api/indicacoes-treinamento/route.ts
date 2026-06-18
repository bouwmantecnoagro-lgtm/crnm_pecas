import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { registrarAtividade } from '@/lib/atividade';

export const dynamic = 'force-dynamic';

// Indicação de treinamento: o vendedor de peças sinaliza, dentro do contexto do
// cliente, que ele deve receber uma oferta de treinamento. A linha vive no
// Supabase compartilhado; o CRM de Treinamentos (Hub) importa as PENDENTES.

type Status = 'PENDENTE' | 'CONVERTIDA' | 'CONCLUIDA' | 'PERDIDA';
const ABERTA: Status[] = ['PENDENTE', 'CONVERTIDA'];

async function getScope(userId: string) {
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

// GET — status da indicação deste cliente (alimenta o badge no Cliente360).
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const codigo = searchParams.get('codigo_cliente');
    const loja = searchParams.get('loja_cliente');
    if (!codigo || !loja) return NextResponse.json({ indicacoes: [] });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('crm_indicacoes_treinamento')
      .select('id, status, mensagem, vendedor_nome, created_at, oportunidade_id')
      .eq('codigo_cliente', codigo)
      .eq('loja_cliente', loja)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ indicacoes: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — registra a indicação. Valida escopo (cliente da carteira) e impede
// duplicar enquanto houver uma indicação aberta para o mesmo cliente.
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const body = await request.json();
    const codigo_cliente = body.codigo_cliente ? String(body.codigo_cliente) : null;
    const loja_cliente = body.loja_cliente ? String(body.loja_cliente) : null;
    const mensagem = typeof body.mensagem === 'string' ? body.mensagem.trim() : '';

    if (!codigo_cliente || !loja_cliente) {
      return NextResponse.json({ error: 'Faltam código e loja do cliente.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { isAdmin, codVendedores } = await getScope(user.id);

    // Busca o cliente (fonte da verdade p/ o snapshot e o vendedor que ganha a
    // bonificação). Também é a checagem de escopo: cliente fora da carteira → 403.
    const { data: cli, error: errCli } = await admin
      .from('crm_clientes')
      .select(
        'CODIGO_CLIENTE, LOJA_CLIENTE, NOME_CLIENTE, CIDADE, UF, DDD, TELEFONE, CELULAR_WHATSAPP_CONTATO, EMAIL, VENDEDOR_RESP, NOME_VENDEDOR_RESP',
      )
      .eq('CODIGO_CLIENTE', codigo_cliente)
      .eq('LOJA_CLIENTE', loja_cliente)
      .limit(1)
      .maybeSingle();

    if (errCli) throw errCli;
    if (!cli) return NextResponse.json({ error: 'Cliente não encontrado na base.' }, { status: 404 });

    const vendedorDoCliente = cli.VENDEDOR_RESP ? String(cli.VENDEDOR_RESP) : null;
    if (!isAdmin && (!vendedorDoCliente || !codVendedores.includes(vendedorDoCliente))) {
      return NextResponse.json({ error: 'Cliente fora da sua carteira.' }, { status: 403 });
    }

    // Já existe indicação aberta p/ este cliente? Evita duplicidade (e duplo card).
    const { data: aberta } = await admin
      .from('crm_indicacoes_treinamento')
      .select('id, status')
      .eq('codigo_cliente', codigo_cliente)
      .eq('loja_cliente', loja_cliente)
      .in('status', ABERTA)
      .limit(1)
      .maybeSingle();

    if (aberta) {
      return NextResponse.json(
        { error: 'Este cliente já tem uma indicação de treinamento em aberto.' },
        { status: 409 },
      );
    }

    const telefone =
      [cli.DDD, cli.TELEFONE].map((x) => (x ? String(x).trim() : '')).filter(Boolean).join(' ') ||
      (cli.CELULAR_WHATSAPP_CONTATO ? String(cli.CELULAR_WHATSAPP_CONTATO) : null) ||
      null;

    const { data: created, error: errIns } = await admin
      .from('crm_indicacoes_treinamento')
      .insert({
        codigo_cliente,
        loja_cliente,
        nome_cliente: cli.NOME_CLIENTE,
        cidade: cli.CIDADE || null,
        uf: cli.UF || null,
        telefone,
        email: cli.EMAIL || null,
        vendedor_cod: vendedorDoCliente,
        vendedor_nome: cli.NOME_VENDEDOR_RESP || null,
        indicado_por_email: user.email || null,
        mensagem: mensagem || null,
        origem_tela: body.origem_tela || 'CLIENTE360',
        status: 'PENDENTE',
      })
      .select()
      .single();

    if (errIns) throw errIns;

    registrarAtividade({
      userId: user.id,
      userEmail: user.email,
      vendedorCod: vendedorDoCliente,
      evento: 'INDICAR_TREINAMENTO',
      detalhe: cli.NOME_CLIENTE,
      codigoCliente: codigo_cliente,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
