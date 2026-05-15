import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

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
    const {
      codigo_cliente,
      loja_cliente,
      nome_cliente,
      email_antigo,
      email_novo,
      telefone_antigo,
      telefone_novo,
      vendedor_solicitante,
    } = body;

    if (!codigo_cliente || !loja_cliente) {
      return NextResponse.json({ error: 'Faltam parâmetros de identificação (código e loja).' }, { status: 400 });
    }

    // Confere que o cliente está no escopo do user (ou que é admin)
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
        return NextResponse.json(
          { error: 'Cliente fora da sua carteira.' },
          { status: 403 },
        );
      }
    }

    const { error: errLog } = await admin
      .from('crm_solicitacoes_alteracao')
      .insert({
        codigo_cliente,
        loja_cliente,
        nome_cliente,
        email_antigo,
        email_novo,
        telefone_antigo,
        telefone_novo,
        vendedor_solicitante,
        status: 'PENDENTE'
      });

    if (errLog) {
      console.error('Erro ao inserir log de solicitação:', errLog);
      return NextResponse.json({ error: 'Erro ao registrar solicitação de alteração.' }, { status: 500 });
    }

    const updatePayload: any = {};
    if (email_novo !== undefined) updatePayload.EMAIL = email_novo;
    if (telefone_novo !== undefined) {
      updatePayload.TELEFONE = telefone_novo;
      updatePayload.CELULAR_WHATSAPP_CONTATO = telefone_novo;
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: errUpdate } = await admin
        .from('crm_clientes')
        .update(updatePayload)
        .eq('CODIGO_CLIENTE', codigo_cliente)
        .eq('LOJA_CLIENTE', loja_cliente);

      if (errUpdate) {
        console.error('Erro ao atualizar contato provisório no crm_clientes:', errUpdate);
      }
    }

    return NextResponse.json({ success: true, message: 'Solicitação registrada e contato provisório atualizado com sucesso.' });

  } catch (err: any) {
    console.error('Erro na API de atualizar contato:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
