'use client';

import { useState } from 'react';
import { Check, X, Shield, User as UserIcon, Clock } from 'lucide-react';

type Role = 'ADMIN' | 'USER' | 'PENDING';

type UserRow = {
  id: string;
  email: string;
  nome: string | null;
  role: Role;
  created_at: string;
};

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  USER: 'Usuário',
  PENDING: 'Pendente',
};

const ROLE_STYLES: Record<Role, string> = {
  ADMIN: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  USER: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
};

export default function UsersTable({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(userId: string, newRole: Role) {
    setLoadingId(userId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Falha ao atualizar usuário');
      }
      window.location.reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro inesperado');
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/5">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-4 py-3 font-medium">Nome / Email</th>
              <th className="px-4 py-3 font-medium">Nível atual</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const loading = loadingId === u.id;
              const created = new Date(u.created_at).toLocaleString('pt-BR');

              return (
                <tr key={u.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{u.nome || '—'}</div>
                    <div className="text-xs text-gray-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_STYLES[u.role]}`}
                    >
                      {u.role === 'ADMIN' && <Shield size={12} />}
                      {u.role === 'USER' && <UserIcon size={12} />}
                      {u.role === 'PENDING' && <Clock size={12} />}
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{created}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {isSelf && (
                        <span className="text-xs text-gray-500 italic">você</span>
                      )}
                      {!isSelf && u.role === 'PENDING' && (
                        <>
                          <ActionButton
                            onClick={() => changeRole(u.id, 'USER')}
                            disabled={loading}
                            variant="approve"
                            icon={<Check size={14} />}
                          >
                            Aprovar
                          </ActionButton>
                          <ActionButton
                            onClick={() => changeRole(u.id, 'ADMIN')}
                            disabled={loading}
                            variant="promote"
                            icon={<Shield size={14} />}
                          >
                            Aprovar como Admin
                          </ActionButton>
                        </>
                      )}
                      {!isSelf && u.role === 'USER' && (
                        <>
                          <ActionButton
                            onClick={() => changeRole(u.id, 'ADMIN')}
                            disabled={loading}
                            variant="promote"
                            icon={<Shield size={14} />}
                          >
                            Tornar Admin
                          </ActionButton>
                          <ActionButton
                            onClick={() => changeRole(u.id, 'PENDING')}
                            disabled={loading}
                            variant="suspend"
                            icon={<X size={14} />}
                          >
                            Suspender
                          </ActionButton>
                        </>
                      )}
                      {!isSelf && u.role === 'ADMIN' && (
                        <ActionButton
                          onClick={() => changeRole(u.id, 'USER')}
                          disabled={loading}
                          variant="demote"
                          icon={<UserIcon size={14} />}
                        >
                          Rebaixar
                        </ActionButton>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  Nenhum usuário cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  variant,
  icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant: 'approve' | 'promote' | 'suspend' | 'demote';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    approve: 'bg-green-500/15 text-green-300 border-green-500/30 hover:bg-green-500/25',
    promote: 'bg-violet-500/15 text-violet-300 border-violet-500/30 hover:bg-violet-500/25',
    suspend: 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25',
    demote: 'bg-slate-500/15 text-slate-300 border-slate-500/30 hover:bg-slate-500/25',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${styles[variant]}`}
    >
      {icon}
      {children}
    </button>
  );
}
