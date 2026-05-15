import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import UsersTable from './UsersTable';

export const dynamic = 'force-dynamic';

export default async function UsuariosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const admin = createAdminClient();
  const { data: myProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (myProfile?.role !== 'ADMIN') {
    redirect('/');
  }

  const [{ data: users }, { data: vendedores }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, email, nome, role, cod_vendedor, created_at')
      .order('created_at', { ascending: false }),
    admin
      .from('crm_vendedores_disponiveis')
      .select('cod, nome'),
  ]);

  const pendingCount = (users ?? []).filter((u) => u.role === 'PENDING').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Gerenciar Usuários</h1>
        <p className="text-sm text-gray-400 mt-1">
          Aprove novos usuários, gerencie níveis de acesso e associe vendedores.
          {pendingCount > 0 && (
            <span className="ml-2 text-amber-400">
              {pendingCount} {pendingCount === 1 ? 'usuário aguardando' : 'usuários aguardando'} aprovação.
            </span>
          )}
        </p>
      </div>

      <UsersTable
        users={users ?? []}
        currentUserId={user.id}
        vendedores={vendedores ?? []}
      />
    </div>
  );
}
