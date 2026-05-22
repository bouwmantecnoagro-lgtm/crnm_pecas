import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VALID_ROLES = ['ADMIN', 'USER'] as const;
type Role = (typeof VALID_ROLES)[number];

// POST /api/admin/users
// Cria um novo usuário via convite por email (Supabase Auth admin.inviteUserByEmail)
// e já provisiona o profile com role + vendedores selecionados.
//
// Body: { email, nome?, role: 'USER'|'ADMIN', cod_vendedor?: string[] }
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    nome?: string;
    role?: string;
    cod_vendedor?: string[];
  } | null;

  const email = body?.email?.trim().toLowerCase();
  const nome = body?.nome?.trim() || null;
  const role = (body?.role || 'USER') as Role;
  const codVendedores = Array.isArray(body?.cod_vendedor) ? body!.cod_vendedor : [];

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Email inválido.' }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Role inválida. Use USER ou ADMIN.' }, { status: 400 });
  }

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

  // Convida via email — Supabase cria o auth.users e dispara magic link.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
  if (inviteError || !invited?.user) {
    return NextResponse.json(
      { error: inviteError?.message || 'Falha ao criar convite. Email já existe?' },
      { status: 500 },
    );
  }

  // Upsert do profile: trigger pode já ter criado a linha como PENDING.
  // Sobrescrevemos com role/nome/vendedores escolhidos pelo admin.
  const profile = {
    id: invited.user.id,
    email,
    nome,
    role,
    cod_vendedor: role === 'ADMIN' ? null : (codVendedores.length > 0 ? codVendedores : null),
    updated_at: new Date().toISOString(),
  };

  const { error: profileError } = await admin
    .from('profiles')
    .upsert(profile, { onConflict: 'id' });

  if (profileError) {
    // Convite foi criado mas profile falhou — devolve erro pra admin tomar ciência
    return NextResponse.json(
      { error: `Convite enviado, mas falhou ao gravar profile: ${profileError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, userId: invited.user.id, email });
}
