'use client';

import { useMemo, useState } from 'react';
import { Check, X, Shield, User as UserIcon, Clock, Users as UsersIcon, Search, UserPlus, Trash2 } from 'lucide-react';

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
  const [adding, setAdding] = useState(false);

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

      <div className="flex justify-end">
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-400 transition"
        >
          <UserPlus size={16} />
          Adicionar Usuário
        </button>
      </div>

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

      {adding && (
        <AddUserModal
          vendedores={vendedores}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

type BulkItem = { email: string; role: 'USER' | 'ADMIN'; status: 'pending' | 'ok' | 'error'; msg?: string };

function AddUserModal({
  vendedores,
  onClose,
}: {
  vendedores: Vendedor[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [role, setRole] = useState<'USER' | 'ADMIN'>('USER');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modo lote
  const [bulkInput, setBulkInput] = useState('');
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  function parseBulk() {
    const candidatos = bulkInput.split(/[\s,;\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    const validos: BulkItem[] = [];
    const seen = new Set(bulkItems.map(b => b.email));
    for (const c of candidatos) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      validos.push({ email: c, role: 'USER', status: 'pending' });
    }
    setBulkItems(prev => [...prev, ...validos]);
    setBulkInput('');
  }

  function setBulkRole(idx: number, newRole: 'USER' | 'ADMIN') {
    setBulkItems(prev => prev.map((b, i) => i === idx ? { ...b, role: newRole } : b));
  }
  function removeBulk(idx: number) {
    setBulkItems(prev => prev.filter((_, i) => i !== idx));
  }
  function setAllRoles(r: 'USER' | 'ADMIN') {
    setBulkItems(prev => prev.map(b => b.status === 'pending' ? { ...b, role: r } : b));
  }

  async function saveBulk() {
    setSaving(true);
    setError(null);
    const pendentes = bulkItems.map((b, i) => ({ b, i })).filter(x => x.b.status === 'pending');
    setBulkProgress({ done: 0, total: pendentes.length });
    let done = 0;
    for (const { b, i } of pendentes) {
      try {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: b.email, role: b.role }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setBulkItems(prev => prev.map((x, j) => j === i ? { ...x, status: 'ok' as const } : x));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro';
        setBulkItems(prev => prev.map((x, j) => j === i ? { ...x, status: 'error' as const, msg } : x));
      }
      done++;
      setBulkProgress({ done, total: pendentes.length });
    }
    setSaving(false);
    // Não reload automático: deixa admin ver o resultado item-a-item
  }

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
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          nome: nome || undefined,
          role,
          cod_vendedor: role === 'USER' ? Array.from(selected) : [],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Falha ao adicionar usuário');
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
          <h2 className="text-lg font-semibold text-white">Adicionar Usuário</h2>
          <p className="text-xs text-gray-400 mt-1">
            Um email de convite será enviado. O usuário precisa aceitar o convite (ou logar via Entra com o mesmo email) pra ativar a conta.
          </p>
          <div className="mt-3 inline-flex rounded-md border border-white/10 bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`px-3 py-1 text-xs rounded ${mode === 'single' ? 'bg-sky-500/20 text-sky-200' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Individual
            </button>
            <button
              type="button"
              onClick={() => setMode('bulk')}
              className={`px-3 py-1 text-xs rounded ${mode === 'bulk' ? 'bg-sky-500/20 text-sky-200' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Em lote
            </button>
          </div>
        </div>

        {mode === 'bulk' ? (
          <BulkPanel
            bulkInput={bulkInput}
            setBulkInput={setBulkInput}
            bulkItems={bulkItems}
            setBulkRole={setBulkRole}
            removeBulk={removeBulk}
            setAllRoles={setAllRoles}
            parseBulk={parseBulk}
            bulkProgress={bulkProgress}
          />
        ) : (
        <>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="fulano@bouwman.com.br"
              autoFocus
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-sky-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1">Nome (opcional)</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Fulano da Silva"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-sky-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1">Nível</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRole('USER')}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition ${
                  role === 'USER'
                    ? 'bg-sky-500/15 border-sky-500/30 text-sky-200'
                    : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                }`}
              >
                <UserIcon size={14} className="inline mr-1.5 -mt-0.5" />
                Usuário
              </button>
              <button
                type="button"
                onClick={() => setRole('ADMIN')}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition ${
                  role === 'ADMIN'
                    ? 'bg-violet-500/15 border-violet-500/30 text-violet-200'
                    : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                }`}
              >
                <Shield size={14} className="inline mr-1.5 -mt-0.5" />
                Administrador
              </button>
            </div>
          </div>
        </div>

        {role === 'USER' && (
          <>
            <div className="px-5 py-3 border-t border-white/10">
              <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">
                Vendedores que o usuário pode ver (opcional)
              </div>
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
                {selected.size === 0 && <span className="ml-2 text-amber-400">— em branco = usuário não vê dados de venda</span>}
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto border-t border-white/10">
              {filtered.length === 0 && (
                <div className="px-5 py-6 text-center text-sm text-gray-400">Nenhum vendedor encontrado.</div>
              )}
              {filtered.map((v) => {
                const checked = selected.has(v.cod);
                return (
                  <label
                    key={v.cod}
                    className="flex items-center gap-3 border-b border-white/5 px-5 py-2 cursor-pointer hover:bg-white/5"
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
          </>
        )}
        </>
        )}

        {error && (
          <div className="mx-5 mt-3 rounded-md bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
          <button
            onClick={() => { if (bulkItems.some(b => b.status === 'ok')) window.location.reload(); else onClose(); }}
            disabled={saving}
            className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-50"
          >
            {mode === 'bulk' && bulkItems.some(b => b.status === 'ok') ? 'Fechar e atualizar' : 'Cancelar'}
          </button>
          {mode === 'single' ? (
            <button
              onClick={save}
              disabled={saving || !email}
              className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
            >
              {saving ? 'Enviando convite…' : 'Adicionar e enviar convite'}
            </button>
          ) : (
            <button
              onClick={saveBulk}
              disabled={saving || !bulkItems.some(b => b.status === 'pending')}
              className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
            >
              {saving
                ? `Enviando ${bulkProgress?.done || 0}/${bulkProgress?.total || 0}…`
                : `Enviar ${bulkItems.filter(b => b.status === 'pending').length} convite${bulkItems.filter(b => b.status === 'pending').length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BulkPanel({
  bulkInput, setBulkInput, bulkItems, setBulkRole, removeBulk, setAllRoles, parseBulk, bulkProgress,
}: {
  bulkInput: string;
  setBulkInput: (v: string) => void;
  bulkItems: BulkItem[];
  setBulkRole: (idx: number, role: 'USER' | 'ADMIN') => void;
  removeBulk: (idx: number) => void;
  setAllRoles: (r: 'USER' | 'ADMIN') => void;
  parseBulk: () => void;
  bulkProgress: { done: number; total: number } | null;
}) {
  const pendentes = bulkItems.filter(b => b.status === 'pending').length;
  const ok = bulkItems.filter(b => b.status === 'ok').length;
  const erro = bulkItems.filter(b => b.status === 'error').length;
  return (
    <div className="px-5 py-4 space-y-3">
      <div>
        <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1">
          Cole emails (separados por vírgula, ponto-e-vírgula, espaço ou quebra de linha)
        </label>
        <textarea
          value={bulkInput}
          onChange={(e) => setBulkInput(e.target.value)}
          placeholder="fulano@bouwman.com.br, ciclano@bouwman.com.br&#10;outro@bouwman.com.br"
          rows={3}
          className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-sky-500/50 focus:outline-none font-mono"
        />
        <div className="flex justify-between mt-2">
          <div className="text-xs text-gray-400">
            {bulkItems.length > 0 && (
              <>
                {pendentes} pendente{pendentes === 1 ? '' : 's'}
                {ok > 0 && <span className="text-green-400"> • {ok} enviado{ok === 1 ? '' : 's'}</span>}
                {erro > 0 && <span className="text-red-400"> • {erro} com erro</span>}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={parseBulk}
            disabled={!bulkInput.trim()}
            className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
          >
            Carregar emails
          </button>
        </div>
      </div>

      {bulkItems.length > 0 && (
        <>
          <div className="flex items-center justify-between border-t border-white/10 pt-3">
            <div className="text-xs uppercase tracking-wider text-gray-400">Marque o nível de cada um</div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setAllRoles('USER')}
                className="text-xs rounded border border-white/10 px-2 py-1 text-gray-300 hover:bg-white/5"
              >
                Todos: Usuário
              </button>
              <button
                type="button"
                onClick={() => setAllRoles('ADMIN')}
                className="text-xs rounded border border-white/10 px-2 py-1 text-gray-300 hover:bg-white/5"
              >
                Todos: Admin
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto rounded border border-white/10 divide-y divide-white/5">
            {bulkItems.map((b, idx) => (
              <div key={b.email} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{b.email}</div>
                  {b.status === 'error' && <div className="text-xs text-red-400 truncate">{b.msg}</div>}
                  {b.status === 'ok' && <div className="text-xs text-green-400">Convite enviado</div>}
                </div>
                {b.status === 'pending' && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setBulkRole(idx, 'USER')}
                      className={`text-xs rounded px-2 py-1 border ${
                        b.role === 'USER' ? 'bg-sky-500/20 border-sky-500/40 text-sky-200' : 'border-white/10 text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      Usuário
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkRole(idx, 'ADMIN')}
                      className={`text-xs rounded px-2 py-1 border ${
                        b.role === 'ADMIN' ? 'bg-violet-500/20 border-violet-500/40 text-violet-200' : 'border-white/10 text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      Admin
                    </button>
                  </div>
                )}
                {b.status === 'ok' && <Check size={14} className="text-green-400" />}
                {b.status === 'error' && <X size={14} className="text-red-400" />}
                {b.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => removeBulk(idx)}
                    className="text-gray-500 hover:text-red-400"
                    title="Remover"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {bulkItems.length === 0 && (
        <div className="text-xs text-gray-500 italic">
          Cole os emails acima e clique &quot;Carregar emails&quot; pra começar. Emails inválidos ou repetidos são descartados.
        </div>
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
