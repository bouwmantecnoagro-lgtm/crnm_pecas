import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { registrarAtividade } from '@/lib/atividade';

export const dynamic = 'force-dynamic';

// POST /api/clientes/observacao — salva a observação livre do vendedor no cliente.
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('role, cod_vendedor')
      .eq('id', user.id)
      .single();
    const isAdmin = profile?.role === 'ADMIN';
    const codVendedores = (profile?.cod_vendedor as string[] | null) ?? [];

    const body = await request.json();
    const { codigo_cliente, loja_cliente, nome_cliente, observacao } = body;

    if (!codigo_cliente || !loja_cliente) {
      return NextResponse.json({ error: 'Faltam código e loja do cliente.' }, { status: 400 });
    }

    // Escopo: vendedor só edita cliente da própria carteira; admin edita qualquer um.
    if (!isAdmin) {
      const { data: cli } = await admin
        .from('crm_clientes')
        .select('VENDEDOR_RESP')
        .eq('CODIGO_CLIENTE', codigo_cliente)
        .eq('LOJA_CLIENTE', loja_cliente)
        .limit(1)
        .maybeSingle();
      const vendedorDoCliente = cli?.VENDEDOR_RESP ? String(cli.VENDEDOR_RESP) : null;
      if (!vendedorDoCliente || !codVendedores.includes(vendedorDoCliente)) {
        return NextResponse.json({ error: 'Cliente fora da sua carteira.' }, { status: 403 });
      }
    }

    const texto = typeof observacao === 'string' ? observacao.trim() : '';
    const { error: errUpdate } = await admin
      .from('crm_clientes')
      .update({
        OBSERVACAO_VENDEDOR: texto || null,
        DATA_OBSERVACAO: texto ? new Date().toISOString() : null,
        QUEM_OBSERVOU: texto ? (user.email || null) : null,
      })
      .eq('CODIGO_CLIENTE', codigo_cliente)
      .eq('LOJA_CLIENTE', loja_cliente);

    if (errUpdate) {
      return NextResponse.json({ error: 'Erro ao salvar observação.' }, { status: 500 });
    }

    registrarAtividade({
      userId: user.id,
      userEmail: user.email,
      vendedorCod: codVendedores.join(',') || null,
      evento: 'OBSERVACAO_CLIENTE',
      detalhe: nome_cliente || null,
      codigoCliente: codigo_cliente,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
