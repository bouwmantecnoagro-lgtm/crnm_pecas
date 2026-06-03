import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET /api/dados/performance
// Win Rate comparativo por vendedor (30d / 90d / 12m / histórico) + base pra média
// do grupo. Agregado pela view crm_winrate_vendedor (Postgres) — devolve ~1 linha por
// vendedor, não linhas cruas. SOMENTE ADMIN (a comparação de pares é visão gerencial).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: myProfile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (myProfile?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { data, error } = await admin
    .from('crm_winrate_vendedor')
    .select('*')
    .order('fechados_hist', { ascending: false });

  if (error) {
    // Erro mais comum: view ainda não criada (rodar sql/07-winrate-comparativo.sql).
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
