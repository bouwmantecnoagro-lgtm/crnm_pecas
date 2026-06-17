import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import AdocaoDashboard from './AdocaoDashboard';

export const dynamic = 'force-dynamic';

export default async function AdocaoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: myProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (myProfile?.role !== 'ADMIN') redirect('/');

  // Usuários (profiles) + último login (auth.users)
  const [{ data: profiles }, authList] = await Promise.all([
    admin.from('profiles').select('id, email, nome, role, cod_vendedor'),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const lastSignIn = new Map<string, string | null>();
  for (const u of (authList?.data?.users ?? [])) {
    lastSignIn.set(u.id, u.last_sign_in_at ?? null);
  }

  // Eventos dos últimos 30 dias
  const desde = new Date();
  desde.setDate(desde.getDate() - 30);
  const { data: eventos } = await admin
    .from('crm_atividade')
    .select('user_id, user_email, evento, detalhe, codigo_cliente, numero_orcamento, created_at')
    .gte('created_at', desde.toISOString())
    .order('created_at', { ascending: false });

  // Agrega por usuário
  const agg = new Map<string, any>();
  for (const e of (eventos ?? [])) {
    const k = e.user_id || e.user_email || 'desconhecido';
    if (!agg.has(k)) agg.set(k, { acessos: 0, criar: 0, concluir: 0, reagendar: 0, obs: 0, total: 0, ultima: null });
    const a = agg.get(k);
    if (e.evento === 'ACESSO') a.acessos++;
    else if (e.evento === 'CRIAR_ACAO') a.criar++;
    else if (e.evento === 'CONCLUIR_ACAO') a.concluir++;
    else if (e.evento === 'REAGENDAR_ACAO') a.reagendar++;
    else if (e.evento === 'OBSERVACAO_CLIENTE') a.obs++;
    a.total++;
    if (!a.ultima || e.created_at > a.ultima) a.ultima = e.created_at;
  }

  const rows = (profiles ?? [])
    .filter((p) => p.role === 'USER' || p.role === 'ADMIN')
    .map((p) => {
      const a = agg.get(p.id) || {};
      return {
        nome: p.nome || (p.email ? String(p.email).split('@')[0] : 'Sem nome'),
        email: p.email || '',
        role: p.role,
        codVendedor: Array.isArray(p.cod_vendedor) ? p.cod_vendedor.join(', ') : '',
        ultimoLogin: lastSignIn.get(p.id) ?? null,
        ultimaAtividade: a.ultima ?? null,
        acessos: a.acessos || 0,
        criar: a.criar || 0,
        concluir: a.concluir || 0,
        reagendar: a.reagendar || 0,
        obs: a.obs || 0,
        total: a.total || 0,
      };
    });

  const feed = (eventos ?? []).slice(0, 40);

  return <AdocaoDashboard rows={rows} feed={feed} />;
}
