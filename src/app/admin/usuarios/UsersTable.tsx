'use client';

import { useMemo, useState } from 'react';
import { Check, X, Shield, User as UserIcon, Clock, Users as UsersIcon, Search } from 'lucide-react';

type Role = 'ADMIN' | 'USER' | 'PENDING';

type UserRow = {
  id: string;
  email: string;
  nome: string | null;
  role: Role;
  cod_vendedor: string[] | null;
  created_at: string;
};

type Vendedor = {
  cod: string;
  nome: string | null;
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
  vendedores,
}: {
  users: UserRow[];
  currentUserId: string;
  vendedores: Vendedor[];
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingVendedoresOf, setEditingVendedoresOf] = useState<UserRow | null>(null);

  const vendedorNome = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendedores) m.set(v.cod, v.nome ?? v.cod);
    return m;
  }, [vendedores]);

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
              <th className="px-4 py-3 font-medium">Nível</th>
              <th className="px-4 py-3 font-medium">Vendedores associados</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const loading = loadingId === u.id;
              const created = new Date(u.created_at).toLocaleString('pt-BR');
              const cods = u.cod_vendedor ?? [];

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
                  <td className="px-4 py-3">
                    {u.role === 'ADMIN' ? (
                      <span className="text-xs text-gray-500 italic">vê todos</span>
                    ) : cods.length === 0 ? (
                      <span className="text-xs text-amber-400">nenhum (não vê dados)</span>
                    ) : (
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {cods.slice(0, 4).map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs text-gray-200"
                            title={vendedorNome.get(c) ?? c}
                          >
                            {vendedorNome.get(c) ?? c}
                          </span>
                        ))}
                        {cods.length > 4 && (
                          <span className="text-xs text-gray-400">+{cods.length - 4}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{created}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2 flex-wrap">
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
                      {u.role === 'USER' && (
                        <ActionButton
                          onClick={() => setEditingVendedoresOf(u)}
                          disabled={loading}
                          variant="vendedores"
                          icon={<UsersIcon size={14} />}
                        >
                          Vendedores
                        </ActionButton>
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
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Nenhum usuário cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingVendedoresOf && (
        <VendedoresModal
          user={editingVendedoresOf}
          vendedores={vendedores}
          onClose={() => setEditingVendedoresOf(null)}
        />
      )}
    </div>
  );
}

function VendedoresModal({
  user,
  vendedores,
  onClose,
}: {
  user: UserRow;
  vendedores: Vendedor[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(user.cod_vendedor ?? []),
  );
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return vendedores;
    return vendedores.filter(
      (v) =>
        v.cod.toLowerCase().includes(s) ||
        (v.nome ?? '').toLowerCase().includes(s),
    );
  }, [vendedores, search]);

  function toggle(cod: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cod)) next.delete(cod);
      else next.add(cod);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/vendedores`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codVendedores: Array.from(selected) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Falha ao salvar');
      }
      window.location.reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro inesperado');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-white/10 bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">
            Vendedores de {user.nome || user.email}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Selecione os códigos de vendedor que este usuário pode ver. Em branco = não vê nenhum dado de venda.
          </p>
        </div>

        <div className="px-5 py-3 border-b border-white/10">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código ou nome..."
              className="w-full rounded-md border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-sky-500/50 focus:outline-none"
            />
          </div>
          <div className="text-xs text-gray-400 mt-2">
            {selected.size} selecionado{selected.size === 1 ? '' : 's'} de {vendedores.length}
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              Nenhum vendedor encontrado.
            </div>
          )}
          {filtered.map((v) => {
            const checked = selected.has(v.cod);
            return (
              <label
                key={v.cod}
                className="flex items-center gap-3 border-b border-white/5 px-5 py-2.5 cursor-pointer hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(v.cod)}
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-sky-500 focus:ring-sky-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{v.nome ?? '—'}</div>
                  <div className="text-xs text-gray-400">cód. {v.cod}</div>
                </div>
              </label>
            );
          })}
        </div>

        {error && (
          <div className="mx-5 mt-3 rounded-md bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
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
  variant: 'approve' | 'promote' | 'suspend' | 'demote' | 'vendedores';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    approve: 'bg-green-500/15 text-green-300 border-green-500/30 hover:bg-green-500/25',
    promote: 'bg-violet-500/15 text-violet-300 border-violet-500/30 hover:bg-violet-500/25',
    suspend: 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25',
    demote: 'bg-slate-500/15 text-slate-300 border-slate-500/30 hover:bg-slate-500/25',
    vendedores: 'bg-sky-500/15 text-sky-300 border-sky-500/30 hover:bg-sky-500/25',
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
