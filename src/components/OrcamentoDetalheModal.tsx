'use client';

import { useEffect, useState } from 'react';
import { X, FileText, Loader2, Calendar, CalendarClock, User, DollarSign, Package } from 'lucide-react';
import { getStatusVivo, labelStatusOrcamento } from '@/lib/orcamento';

interface OrcamentoDetalheModalProps {
  numero: string;
  // Desempate: o número recicla entre filiais/anos/clientes.
  filial?: string | null;
  codigo?: string | null;
  loja?: string | null;
  onClose: () => void;
}

function fmtData(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(String(d).split('T')[0] + 'T00:00:00');
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('pt-BR');
}

function fmtMoeda(v: number): string {
  return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_CHIP: Record<string, string> = {
  GANHO: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  PERDIDO: 'bg-red-500/20 text-red-300 border-red-500/30',
  VENCIDO: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  ABERTO: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
};

export default function OrcamentoDetalheModal({ numero, filial, codigo, loja, onClose }: OrcamentoDetalheModalProps) {
  const [linhas, setLinhas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const qs = new URLSearchParams({ numero });
        if (filial) qs.set('filial', filial);
        if (codigo) { qs.set('codigo', String(codigo)); if (loja) qs.set('loja', String(loja)); }
        const res = await fetch(`/api/orcamentos?${qs}`);
        const data = await res.json();
        if (!ativo) return;
        if (!res.ok) { setErro(data?.error || 'Erro ao carregar orçamento.'); return; }
        setLinhas(Array.isArray(data) ? data : []);
      } catch {
        if (ativo) setErro('Erro de conexão ao carregar o orçamento.');
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, [numero, filial, codigo, loja]);

  const head = linhas[0] || {};
  const total = linhas.reduce((acc, l) => acc + (l.ORC_VALOR_TOTAL || 0), 0);
  const statusLabel = labelStatusOrcamento(getStatusVivo(head));
  const chip = STATUS_CHIP[statusLabel] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-[#0b101a] border border-white/10 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-gradient-to-r from-amber-500/10 to-sky-500/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <FileText size={20} className="text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Orçamento #{numero}</h2>
              {!loading && !erro && (
                <p className="text-xs text-gray-400 truncate max-w-[320px]">{head.CLIENTE_ORC || 'Cliente não identificado'}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!loading && !erro && linhas.length > 0 && (
              <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded border ${chip}`}>{statusLabel}</span>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="text-amber-400 animate-spin" />
            </div>
          ) : erro ? (
            <p className="text-sm text-red-400 py-6 text-center">{erro}</p>
          ) : linhas.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Orçamento não encontrado ou fora do seu acesso.</p>
          ) : (
            <>
              {/* Resumo */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1 mb-1"><DollarSign size={11} /> Valor total</p>
                  <p className="text-sm font-bold text-emerald-300">{fmtMoeda(total)}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1 mb-1"><Calendar size={11} /> Emissão</p>
                  <p className="text-sm font-medium text-white">{fmtData(head.ORC_DATA_EMISSAO_ORCAMENTO)}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1 mb-1"><CalendarClock size={11} /> Validade</p>
                  <p className="text-sm font-medium text-white">{fmtData(head.ORC_DATA_ORCAMENTO)}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1 mb-1"><User size={11} /> Vendedor</p>
                  <p className="text-sm font-medium text-white truncate" title={head.ORC_NOME_VENDEDOR}>{head.ORC_NOME_VENDEDOR || '—'}</p>
                </div>
              </div>

              {/* Linhas / produtos */}
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1"><Package size={11} /> Itens ({linhas.length})</p>
              <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-white/5 divide-y divide-white/5">
                {linhas.map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-white/[0.02]">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-amber-300/90 truncate" title={l.CODIGO_PRODUTO_ORC}>{l.CODIGO_PRODUTO_ORC || '—'}</p>
                      <p className="text-[10px] text-gray-500">Saldo: {l.ORC_SALDO_ORCAMENTO ?? '—'} · Unit.: {fmtMoeda(l.ORC_VALOR_UNITARIO)}</p>
                    </div>
                    <span className="text-sm font-bold text-emerald-300 shrink-0">{fmtMoeda(l.ORC_VALOR_TOTAL)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
