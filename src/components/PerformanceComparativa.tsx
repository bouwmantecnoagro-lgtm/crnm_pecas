'use client';

import { useEffect, useState } from 'react';
import { Award, TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';

type Row = {
  cod: string; nome: string;
  fechados_hist: number; faturados_hist: number;
  fechados_12m: number; faturados_12m: number;
  fechados_90d: number; faturados_90d: number;
  fechados_30d: number; faturados_30d: number;
};

const MIN_AMOSTRA = 3; // abaixo disso o Win Rate não tem significado
const wr = (fat: number, fech: number) => (fech >= MIN_AMOSTRA ? (fat / fech) * 100 : null);
const pp = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)} p.p.`;

export default function PerformanceComparativa() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [estado, setEstado] = useState<'load' | 'ok' | 'oculto' | 'erro'>('load');
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    fetch('/api/dados/performance')
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) { if (vivo) setEstado('oculto'); return null; }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        return j as Row[];
      })
      .then((d) => { if (vivo && d) { setRows(d); setEstado('ok'); } })
      .catch((e) => { if (vivo) { setErro(String(e.message || e)); setEstado('erro'); } });
    return () => { vivo = false; };
  }, []);

  // Silencioso para não-admin e enquanto carrega (evita flash de layout).
  if (estado === 'oculto' || estado === 'load') return null;

  if (estado === 'erro') {
    return (
      <div className="glass-panel p-5 border border-amber-500/20 bg-amber-950/10">
        <h2 className="text-sm font-semibold text-amber-200 flex items-center gap-2">
          <Award size={16} /> Performance Comparativa do Vendedor
        </h2>
        <p className="text-xs text-amber-300/80 mt-2">
          Painel indisponível. Provável causa: a view <code className="bg-black/30 px-1 rounded">crm_winrate_vendedor</code> ainda
          não foi criada — rode <code className="bg-black/30 px-1 rounded">sql/07-winrate-comparativo.sql</code> no Supabase.
        </p>
        <p className="text-[10px] text-gray-500 mt-1">Detalhe: {erro}</p>
      </div>
    );
  }

  const data = rows || [];

  // Médias do grupo (agregado ponderado = soma faturados / soma fechados).
  const sum = (k: keyof Row) => data.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const grupoHist = wr(sum('faturados_hist'), sum('fechados_hist'));
  const grupo30 = wr(sum('faturados_30d'), sum('fechados_30d'));

  const linhas = data
    .map((r) => ({
      ...r,
      wr30: wr(r.faturados_30d, r.fechados_30d),
      wrHist: wr(r.faturados_hist, r.fechados_hist),
    }))
    .filter((r) => r.wrHist !== null || r.wr30 !== null)
    .sort((a, b) => {
      // quem tem amostra de 30d primeiro (ordenado por WR 30d), depois por histórico
      if ((a.wr30 === null) !== (b.wr30 === null)) return a.wr30 === null ? 1 : -1;
      if (a.wr30 !== null && b.wr30 !== null) return b.wr30 - a.wr30;
      return (b.wrHist ?? 0) - (a.wrHist ?? 0);
    });

  const cor = (v: number) => (v > 1 ? 'text-emerald-400' : v < -1 ? 'text-red-400' : 'text-gray-400');

  return (
    <div className="glass-panel p-6 border border-emerald-500/20 bg-emerald-950/5">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-1">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Award size={18} className="text-emerald-400" />
          Performance Comparativa do Vendedor
        </h2>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-gray-400">
            <Users size={13} className="text-emerald-400/70" /> Média do grupo:
          </span>
          <span className="text-gray-300">30d <strong className="text-white">{grupo30 !== null ? `${grupo30.toFixed(1)}%` : '—'}</strong></span>
          <span className="text-gray-300">Histórico <strong className="text-white">{grupoHist !== null ? `${grupoHist.toFixed(1)}%` : '—'}</strong></span>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Win Rate por contagem (FATURADO ÷ fechados). Histórico = todo o período · exige ≥{MIN_AMOSTRA} fechados na janela · exclui grupo Bouwman.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-white/10">
              <th className="text-left font-semibold py-2 pr-2">Vendedor</th>
              <th className="text-right font-semibold py-2 px-2">30 dias</th>
              <th className="text-right font-semibold py-2 px-2">Histórico</th>
              <th className="text-right font-semibold py-2 px-2">Tendência</th>
              <th className="text-right font-semibold py-2 pl-2">vs Grupo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => {
              const tend = r.wr30 !== null && r.wrHist !== null ? r.wr30 - r.wrHist : null;
              const vsGrupo = r.wrHist !== null && grupoHist !== null ? r.wrHist - grupoHist : null;
              return (
                <tr key={r.cod} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 pr-2">
                    <div className="font-semibold text-gray-200 uppercase truncate max-w-[200px]" title={r.nome}>{r.nome || r.cod}</div>
                  </td>
                  <td className="text-right py-2.5 px-2">
                    {r.wr30 !== null ? (
                      <span className="font-bold text-white">{r.wr30.toFixed(1)}%
                        <span className="text-[10px] text-gray-500 font-normal ml-1">n={r.fechados_30d}</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-600" title={`${r.fechados_30d} fechados nos últimos 30 dias`}>amostra &lt;{MIN_AMOSTRA}</span>
                    )}
                  </td>
                  <td className="text-right py-2.5 px-2">
                    {r.wrHist !== null ? (
                      <span className="text-gray-300">{r.wrHist.toFixed(1)}%
                        <span className="text-[10px] text-gray-600 font-normal ml-1">n={r.fechados_hist}</span>
                      </span>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="text-right py-2.5 px-2">
                    {tend !== null ? (
                      <span className={`inline-flex items-center gap-1 font-semibold ${cor(tend)}`}>
                        {tend > 1 ? <TrendingUp size={13} /> : tend < -1 ? <TrendingDown size={13} /> : <Minus size={13} />}
                        {pp(tend)}
                      </span>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="text-right py-2.5 pl-2">
                    {vsGrupo !== null ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                        vsGrupo > 1 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : vsGrupo < -1 ? 'bg-red-500/10 border-red-500/20 text-red-300'
                        : 'bg-white/5 border-white/10 text-gray-400'}`}>
                        {pp(vsGrupo)}
                      </span>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr><td colSpan={5} className="text-center text-gray-500 py-6 text-sm">Sem vendedores com amostra suficiente.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
