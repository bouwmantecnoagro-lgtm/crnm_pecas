import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// PUT — Atualiza a lista de códigos de vendedor associados ao user.
// Body: { codVendedores: string[] }
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    codVendedores?: unknown;
  } | null;

  const codVendedores = body?.codVendedores;
  if (!Array.isArray(codVendedores) || !codVendedores.every((c) => typeof c === 'string')) {
    return NextResponse.json(
      { error: 'codVendedores deve ser um array de strings.' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: myProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (myProfile?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  // Valida que cada código existe nos dados do Protheus (evita lixo).
  if (codVendedores.length > 0) {
    const { data: validos } = await admin
      .from('crm_vendedores_disponiveis')
      .select('cod')
      .in('cod', codVendedores);
    const validosSet = new Set((validos ?? []).map((v: any) => v.cod));
    const invalidos = codVendedores.filter((c) => !validosSet.has(c));
    if (invalidos.length > 0) {
      return NextResponse.json(
        { error: `Códigos inválidos: ${invalidos.join(', ')}` },
        { status: 400 },
      );
    }
  }

  const { error } = await admin
    .from('profiles')
    .update({
      cod_vendedor: codVendedores,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
