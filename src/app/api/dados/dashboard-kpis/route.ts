import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Agregação dos KPIs de orçamento do dashboard, calculada no Postgres
// (função dashboard_orcamentos_kpis — ver sql/11-dashboard-kpis.sql).
// Evita baixar ~37k orçamentos só pra somar/contar no navegador.
// A função é security invoker → respeita a RLS por vendedor automaticamente.
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const excluir = searchParams.get('excluirInternos');

    const { data, error } = await supabase.rpc('dashboard_orcamentos_kpis', {
      p_vendedor:         searchParams.get('vendedor') || null,
      p_filial:           searchParams.get('filial') || null,
      p_emissao_ini:      searchParams.get('emissaoIni') || null,
      p_emissao_fim:      searchParams.get('emissaoFim') || null,
      p_excluir_internos: excluir === null ? true : excluir === 'true',
    });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
