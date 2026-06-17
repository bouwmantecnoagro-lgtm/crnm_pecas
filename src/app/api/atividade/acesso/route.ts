import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { registrarAtividade } from '@/lib/atividade';

export const dynamic = 'force-dynamic';

// POST /api/atividade/acesso — registra um acesso do usuário logado.
// Chamado pelo DataContext no carregamento do app (1x por sessão de browser).
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    await registrarAtividade({
      userId: user.id,
      userEmail: user.email,
      evento: 'ACESSO',
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
