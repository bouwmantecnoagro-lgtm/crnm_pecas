import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VALID_ROLES = ['ADMIN', 'USER', 'PENDING'] as const;
type Role = (typeof VALID_ROLES)[number];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { role?: string } | null;
  const role = body?.role as Role | undefined;

  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: 'Role inválida. Use ADMIN, USER ou PENDING.' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  if (id === user.id && role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Você não pode rebaixar sua própria conta. Peça a outro admin.' },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
