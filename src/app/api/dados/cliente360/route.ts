import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const codigo_cliente = searchParams.get('codigo_cliente');
    const loja_cliente = searchParams.get('loja_cliente');

    if (!codigo_cliente || !loja_cliente) {
      return NextResponse.json({ error: 'Faltam parâmetros' }, { status: 400 });
    }

    // Protheus geralmente usa zeros a esquerda (6 para código, 2 para loja)
    const codPad = String(codigo_cliente).padStart(6, '0');
    const lojaPad = String(loja_cliente).padStart(2, '0');

    // Busca o Cliente Principal — RLS filtra por VENDEDOR_RESP automaticamente.
    // Se o cliente não está no escopo do user, vem vazio (idêntico a "não encontrado").
    const { data: clienteData, error: errCli } = await supabase
      .from('crm_clientes')
      .select('*')
      .or(`and(CODIGO_CLIENTE.eq.${codigo_cliente},LOJA_CLIENTE.eq.${loja_cliente}),and(CODIGO_CLIENTE.eq.${codPad},LOJA_CLIENTE.eq.${lojaPad})`)
      .limit(1);

    if (errCli) throw errCli;
    if (!clienteData || clienteData.length === 0) {
      return NextResponse.json({ error: 'Cliente não encontrado na base.' }, { status: 404 });
    }

    const cliente = clienteData[0];

    const { data: maquinas, error: errMaq } = await supabase
      .from('crm_parquemaquinas')
      .select('*')
      .eq('COD_CLIENTE', codigo_cliente)
      .eq('LOJA_CLIENTE', loja_cliente);

    if (errMaq) throw errMaq;

    const { data: orcamentos, error: errOrc } = await supabase
      .from('crm_orcamentos')
      .select('*')
      .eq('CODIGO_CLIENTE', codigo_cliente)
      .eq('LOJA_CLIENTE', loja_cliente)
      .order('ORC_VALOR_TOTAL', { ascending: false });

    if (errOrc) throw errOrc;

    return NextResponse.json({
      cliente,
      maquinas: maquinas || [],
      orcamentos: orcamentos || []
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
