'use client';

import { useMemo, useState } from 'react';
import { Activity, LogIn, AlertTriangle, Users, Zap, CheckCircle2, RotateCcw, FileText } from 'lucide-react';

interface Row {
  nome: string;
  email: string;
  role: string;
  codVendedor: string;
  ultimoLogin: string | null;
  ultimaAtividade: string | null;
  acessos: number;
  criar: number;
  concluir: number;
  reagendar: number;
  obs: number;
  total: number;
}

const EVENTO_LABEL: Record<string, string> = {
  ACESSO: 'acessou o sistema',
  CRIAR_ACAO: 'criou ação',
  CONCLUIR_ACAO: 'concluiu ação',
  REAGENDAR_ACAO: 'reagendou ação',
  OBSERVACAO_CLIENTE: 'registrou observação',
};

function diasDesde(d: string | null): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

function statusAdocao(ultimoLogin: string | null) {
  const dias = diasDesde(ultimoLogin);
  if (dias === null) return { label: 'Nunca acessou', cls: 'bg-red-500/15 text-red-300 border-red-500/30' };
  if (dias <= 7) return { label: 'Ativo', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
  if (dias <= 14) return { label: `Pouco ativo (${dias}d)`, cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
  return { label: `Inativo (${dias}d)`, cls: 'bg-red-500/15 text-red-300 border-red-500/30' };
}

function fmtData(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtDataHora(d: string): string {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AdocaoDashboard({ rows, feed }: { rows: Row[]; feed: any[] }) {
  const [sortKey, setSortKey] = useState<keyof Row>('total');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const ordenadas = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, dir]);

  const totalUsuarios = rows.length;
  const ativos = rows.filter((r) => { const d = diasDesde(r.ultimoLogin); return d !== null && d <= 7; }).length;
  const inativos = rows.filter((r) => { const d = diasDesde(r.ultimoLogin); return d === null || d > 14; }).length;
  const totalEventos = rows.reduce((s, r) => s + r.total, 0);

  const th = (key: keyof Row, label: string, alignRight = false) => (
    <th
      className={`px-3 py-3 font-semibold border-b border-white/5 cursor-pointer hover:bg-white/5 select-none ${alignRight ? 'text-right' : 'text-left'}`}
      onClick={() => { if (sortKey === key) setDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setDir('desc'); } }}
    >
      {label}{sortKey === key ? (dir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
    </th>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Activity size={22} className="text-violet-400" /> Fiscal de Adoção</h1>
        <p className="text-sm text-gray-400 mt-1">Quem está usando a ferramenta de verdade — acessos e ações por vendedor (últimos 30 dias).</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi icon={<Users size={18} className="text-sky-400" />} valor={totalUsuarios} label="Usuários aprovados" />
        <Kpi icon={<LogIn size={18} className="text-emerald-400" />} valor={ativos} label="Ativos (≤7 dias)" cor="text-emerald-400" />
        <Kpi icon={<AlertTriangle size={18} className="text-red-400" />} valor={inativos} label="Inativos / nunca" cor="text-red-400" />
        <Kpi icon={<Activity size={18} className="text-violet-400" />} valor={totalEventos} label="Ações registradas (30d)" />
      </div>

      {/* Ranking */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-gray-300">
            <thead className="text-xs uppercase bg-white/[0.03] text-gray-400">
              <tr>
                {th('nome', 'Vendedor')}
                {th('ultimoLogin', 'Último acesso')}
                {th('acessos', 'Acessos', true)}
                {th('criar', 'Criadas', true)}
                {th('concluir', 'Concl.', true)}
                {th('reagendar', 'Reag.', true)}
                {th('obs', 'Obs', true)}
                {th('total', 'Total', true)}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {ordenadas.map((r, i) => {
                const st = statusAdocao(r.ultimoLogin);
                return (
                  <tr key={r.email || i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white">{r.nome}</span>
                        {r.role === 'ADMIN' && <span className="text-[9px] font-bold uppercase bg-sky-500/15 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded">admin</span>}
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{r.email}{r.codVendedor ? ` · cod ${r.codVendedor}` : ''}</div>
                    </td>
                    <td className="px-3 py-3 text-gray-300">{fmtData(r.ultimoLogin)}</td>
                    <td className="px-3 py-3 text-right">{r.acessos}</td>
                    <td className="px-3 py-3 text-right">{r.criar}</td>
                    <td className="px-3 py-3 text-right">{r.concluir}</td>
                    <td className="px-3 py-3 text-right">{r.reagendar}</td>
                    <td className="px-3 py-3 text-right">{r.obs}</td>
                    <td className="px-3 py-3 text-right font-bold text-white">{r.total}</td>
                  </tr>
                );
              })}
              {ordenadas.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-12 text-center text-gray-500">Nenhum usuário aprovado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feed de atividade */}
      <div className="glass-panel p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2"><Zap size={14} className="text-violet-400" /> Atividade recente</h2>
        {feed.length === 0 ? (
          <p className="text-sm text-gray-500">Sem atividade registrada ainda. O rastreamento começou agora — vai encher conforme a equipe usar.</p>
        ) : (
          <ul className="space-y-1.5">
            {feed.map((e, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-gray-300 py-1.5 border-b border-white/[0.03] last:border-0">
                <span className="shrink-0 text-gray-500">{iconeEvento(e.evento)}</span>
                <span className="flex-1 min-w-0">
                  <span className="text-white font-medium">{e.user_email || 'desconhecido'}</span>{' '}
                  <span className="text-gray-400">{EVENTO_LABEL[e.evento] || e.evento}</span>
                  {e.detalhe ? <span className="text-gray-500"> — {e.detalhe}</span> : null}
                  {e.numero_orcamento ? <span className="text-amber-300/80"> (Orç #{e.numero_orcamento})</span> : null}
                </span>
                <span className="shrink-0 text-[11px] text-gray-600">{fmtDataHora(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-gray-600">O rastreamento de eventos começou no deploy desta tela — o histórico de acessos e ações acumula a partir de agora. "Último acesso" vem do login (vale desde sempre).</p>
    </div>
  );
}

function Kpi({ icon, valor, label, cor = 'text-white' }: { icon: React.ReactNode; valor: number; label: string; cor?: string }) {
  return (
    <div className="glass-panel p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">{icon}</div>
      <div>
        <p className={`text-2xl font-black ${cor}`}>{valor}</p>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

function iconeEvento(evento: string) {
  if (evento === 'CRIAR_ACAO') return <Zap size={13} className="text-violet-400" />;
  if (evento === 'CONCLUIR_ACAO') return <CheckCircle2 size={13} className="text-emerald-400" />;
  if (evento === 'REAGENDAR_ACAO') return <RotateCcw size={13} className="text-purple-400" />;
  if (evento === 'OBSERVACAO_CLIENTE') return <FileText size={13} className="text-amber-400" />;
  return <LogIn size={13} className="text-sky-400" />;
}
