import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chaveCliente, filialDe } from '@/lib/acao';

export const dynamic = 'force-dynamic';

// GET /api/orcamentos?numero=XXXX[&filial=01&codigo=000123&loja=01] — retorna as linhas (1 por produto) de um orçamento.
// O número recicla entre filiais/anos/clientes; filial e cliente (quando informados) desempatam.
// Usa o cliente autenticado: RLS limita ao escopo do vendedor (admin vê tudo).
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const numero = searchParams.get('numero');
    if (!numero) {
      return NextResponse.json({ error: 'Parâmetro "numero" é obrigatório.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('crm_orcamentos')
      .select(
        'ORC_NUMERO_ORCAMENTO, FILIAL_ORC, CLIENTE_ORC, CODIGO_CLIENTE, LOJA_CLIENTE, ' +
        'ORC_DATA_EMISSAO_ORCAMENTO, ORC_DATA_ORCAMENTO, CODIGO_PRODUTO_ORC, ' +
        'ORC_VALOR_UNITARIO, ORC_VALOR_TOTAL, ORC_SALDO_ORCAMENTO, ' +
        'ORC_NOME_VENDEDOR, ORC_CODIGO_VENDEDOR, Status, STATUS_OVERRIDE'
      )
      .eq('ORC_NUMERO_ORCAMENTO', numero)
      .order('ORC_VALOR_TOTAL', { ascending: false });

    if (error) throw error;

    let linhas: any[] = data || [];
    const fil = filialDe(searchParams.get('filial'));
    if (fil) linhas = linhas.filter((l: any) => filialDe(l.FILIAL_ORC) === fil);
    const codigo = searchParams.get('codigo');
    if (codigo) {
      const cli = chaveCliente(codigo, searchParams.get('loja'));
      linhas = linhas.filter((l: any) => chaveCliente(l.CODIGO_CLIENTE, l.LOJA_CLIENTE) === cli);
    }
    return NextResponse.json(linhas);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
