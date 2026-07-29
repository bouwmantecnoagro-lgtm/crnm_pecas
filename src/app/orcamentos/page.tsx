'use client';

import { Suspense, useEffect, useState, useMemo, useDeferredValue } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Search, Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Cliente360Modal from '@/components/Cliente360Modal';

import { useData } from '@/contexts/DataContext';
import { getStatusOrcamento, labelStatusOrcamento } from '@/lib/orcamento';

function formatDateUI(val: any) {
  if (!val) return '—';
  const s = String(val);
  if (s === '2030-12-31' || s.includes('2030-12-31')) return 'Indefinido';

  const match = s.match(/^\/Date\((\d+)\)\/$/);
  if (match) {
    const d = new Date(parseInt(match[1], 10));
    // Correção de timezone UTC
    const d2 = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
    return d2.toLocaleDateString('pt-BR');
  }

  if (/^\d{8}$/.test(s)) {
    return `${s.substring(6,8)}/${s.substring(4,6)}/${s.substring(0,4)}`;
  }

  if (s.includes('-')) {
    const [y, m, d] = s.split('T')[0].split('-');
    if (y && m && d) return `${d}/${m}/${y}`;
  }

  return s;
}

// Normaliza os 3 formatos de data do ERP para Date local meia-noite.
function parseOrcDate(val: any): Date | null {
  if (!val) return null;
  const s = String(val);
  const match = s.match(/^\/Date\((\d+)\)\/$/);
  if (match) {
    const d = new Date(parseInt(match[1], 10));
    return new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  }
  if (/^\d{8}$/.test(s)) {
    return new Date(`${s.substring(0,4)}-${s.substring(4,6)}-${s.substring(6,8)}T00:00:00`);
  }
  if (s.includes('-')) {
    return new Date(s.split('T')[0] + 'T00:00:00');
  }
  return null;
}

function dentroIntervalo(d: Date | null, de: string, ate: string): boolean {
  if (!de && !ate) return true;
  if (!d) return false;
  if (de && d < new Date(de + 'T00:00:00')) return false;
  if (ate && d > new Date(ate + 'T23:59:59')) return false;
  return true;
}

// Next 16 exige Suspense em torno de qualquer hook que lê query string num Client Component
// pré-renderizado estaticamente. Sem isso o `next build` falha em "Generating static pages".
export default function OrcamentosPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="text-sky-400 animate-spin" />
      </div>
    }>
      <OrcamentosContent />
    </Suspense>
  );
}

function OrcamentosContent() {
  const { orcamentos, loading, loadingOrcamentos } = useData();
  const searchParams = useSearchParams();
  const [busca, setBusca] = useState('');
  const deferredBusca = useDeferredValue(busca);

  // Pagination
  const [paginaAtual, setPaginaAtual] = useState(1);
  const ITENS_POR_PAGINA = 50;

  // Advanced Filters (inicializados a partir da URL — ex: /orcamentos?status=VENCIDO&periodoVenc=30)
  const [vendedorFiltro, setVendedorFiltro] = useState('');
  const [ordemFiltro, setOrdemFiltro] = useState(''); // 'maior' | 'menor' | ''
  const [statusFiltro, setStatusFiltro] = useState(() => searchParams.get('status') || '');
  // periodoVencFiltro: dias atrás (ex: '30') — filtra ORC_DATA_ORCAMENTO entre hoje-N e hoje
  const [periodoVencFiltro, setPeriodoVencFiltro] = useState(() => searchParams.get('periodoVenc') || '');
  const [emissaoDe, setEmissaoDe] = useState(() => searchParams.get('emissaoDe') || '');
  const [emissaoAte, setEmissaoAte] = useState(() => searchParams.get('emissaoAte') || '');
  const [vencDe, setVencDe] = useState(() => searchParams.get('vencDe') || '');
  const [vencAte, setVencAte] = useState(() => searchParams.get('vencAte') || '');
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null);
  const [cliente360, setCliente360] = useState<{ codigo: string, loja: string, filial?: string | null } | null>(null);

  // Reset pagination when filters change
  useEffect(() => {
    setPaginaAtual(1);
  }, [deferredBusca, vendedorFiltro, ordemFiltro, statusFiltro, periodoVencFiltro, emissaoDe, emissaoAte, vencDe, vencAte, sortConfig]);

  const filtrados = useMemo(() => {
    let result = orcamentos.filter(o => {
      const term = deferredBusca.toLowerCase();
      const passaBusca = (o.CLIENTE_ORC || '').toLowerCase().includes(term) || 
                         (o.ORC_NUMERO_ORCAMENTO || '').toLowerCase().includes(term) || 
                         (o.CODIGO_PRODUTO_ORC || '').toLowerCase().includes(term);
      const passaVendedor = vendedorFiltro ? o.ORC_NOME_VENDEDOR === vendedorFiltro : true;
      const statusObj = getStatusOrcamento(o) || 'ABERTO';
      const passaStatus = statusFiltro ? (statusObj.toLowerCase() === statusFiltro.toLowerCase()) : true;

      let passaPeriodoVenc = true;
      if (periodoVencFiltro) {
        const dias = parseInt(periodoVencFiltro, 10);
        if (!isNaN(dias) && dias > 0 && o.ORC_DATA_ORCAMENTO) {
          const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
          const limite = new Date(hoje); limite.setDate(limite.getDate() - dias);
          const venc = new Date(String(o.ORC_DATA_ORCAMENTO) + 'T00:00:00');
          passaPeriodoVenc = venc >= limite && venc <= hoje;
        } else if (!o.ORC_DATA_ORCAMENTO) {
          passaPeriodoVenc = false;
        }
      }

      const passaEmissao = dentroIntervalo(parseOrcDate(o.ORC_DATA_EMISSAO_ORCAMENTO), emissaoDe, emissaoAte);
      const passaVenc = dentroIntervalo(parseOrcDate(o.ORC_DATA_ORCAMENTO), vencDe, vencAte);

      return passaBusca && passaVendedor && passaStatus && passaPeriodoVenc && passaEmissao && passaVenc;
    });

    if (sortConfig) {
      result.sort((a, b) => {
        let valA = a[sortConfig.key] || '';
        let valB = b[sortConfig.key] || '';
        if (sortConfig.key === 'ORC_DATA_EMISSAO_ORCAMENTO') {
          valA = new Date(valA || 0).getTime();
          valB = new Date(valB || 0).getTime();
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else if (ordemFiltro === 'maior') {
      result.sort((a, b) => (b.ORC_VALOR_TOTAL || 0) - (a.ORC_VALOR_TOTAL || 0));
    } else if (ordemFiltro === 'menor') {
      result.sort((a, b) => (a.ORC_VALOR_TOTAL || 0) - (b.ORC_VALOR_TOTAL || 0));
    }
    
    return result;
  }, [orcamentos, deferredBusca, vendedorFiltro, ordemFiltro, statusFiltro, periodoVencFiltro, emissaoDe, emissaoAte, vencDe, vencAte, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current && current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const vendedores = Array.from(new Set(orcamentos.map(o => o.ORC_NOME_VENDEDOR).filter(Boolean))).sort();

  const totalPaginas = Math.ceil(filtrados.length / ITENS_POR_PAGINA) || 1;
  const itensPaginados = filtrados.slice((paginaAtual - 1) * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA);

  return (
    <div className="flex-1 overflow-y-auto animate-in fade-in duration-500">
      <div className="w-full space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500 mb-2">Orçamentos em Aberto</h1>
            <p className="text-gray-400">Acompanhamento e negociação de propostas comerciais.</p>
          </div>
        </div>

        {/* Barra de Filtros Avançados */}
        <div className="glass-panel p-4 flex flex-wrap gap-4 items-center border border-white/5 bg-black/20">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input 
              type="text" 
              placeholder="Buscar Cliente, Produto ou Nº Orçamento..." 
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-sky-500/50 transition-colors"
            />
          </div>

          <select 
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-300 focus:border-sky-500/50 transition-colors"
            value={vendedorFiltro} onChange={e => setVendedorFiltro(e.target.value)}
          >
            <option value="">Qualquer Vendedor</option>
            {vendedores.map(v => <option key={v as string} value={v as string}>{v as string}</option>)}
          </select>

          <select 
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-300 focus:border-sky-500/50 transition-colors"
            value={ordemFiltro} onChange={e => setOrdemFiltro(e.target.value)}
          >
            <option value="">Ordenação Original</option>
            <option value="maior">Maior Valor R$ (Decrescente)</option>
            <option value="menor">Menor Valor R$ (Crescente)</option>
          </select>
          
          <select
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-300 focus:border-sky-500/50 transition-colors"
            value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}
          >
            <option value="">Todos os Status</option>
            <option value="ABERTO">Aberto</option>
            <option value="FATURADO">Ganho</option>
            <option value="CANCELADO">Perdido</option>
            <option value="VENCIDO">Vencido</option>
          </select>

          <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5">
            <Calendar size={12} className="text-gray-500" />
            <span className="text-[11px] uppercase tracking-wider text-gray-500 mr-1">Emissão</span>
            <input
              type="date" aria-label="Emissão de"
              value={emissaoDe} onChange={e => setEmissaoDe(e.target.value)}
              className="bg-transparent text-xs text-gray-200 focus:outline-none [color-scheme:dark]"
            />
            <span className="text-gray-600 text-xs">→</span>
            <input
              type="date" aria-label="Emissão até"
              value={emissaoAte} onChange={e => setEmissaoAte(e.target.value)}
              className="bg-transparent text-xs text-gray-200 focus:outline-none [color-scheme:dark]"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5">
            <Calendar size={12} className="text-gray-500" />
            <span className="text-[11px] uppercase tracking-wider text-gray-500 mr-1">Vencimento</span>
            <input
              type="date" aria-label="Vencimento de"
              value={vencDe} onChange={e => setVencDe(e.target.value)}
              className="bg-transparent text-xs text-gray-200 focus:outline-none [color-scheme:dark]"
            />
            <span className="text-gray-600 text-xs">→</span>
            <input
              type="date" aria-label="Vencimento até"
              value={vencAte} onChange={e => setVencAte(e.target.value)}
              className="bg-transparent text-xs text-gray-200 focus:outline-none [color-scheme:dark]"
            />
          </div>

          {periodoVencFiltro && (
            <span className="text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <Calendar size={12} /> Vencimento últimos {periodoVencFiltro} dias
              <button onClick={() => setPeriodoVencFiltro('')} className="ml-1 hover:text-white"><X size={12} /></button>
            </span>
          )}

          {(busca || vendedorFiltro || ordemFiltro || statusFiltro || periodoVencFiltro || emissaoDe || emissaoAte || vencDe || vencAte) && (
            <button
              onClick={() => { setBusca(''); setVendedorFiltro(''); setOrdemFiltro(''); setStatusFiltro(''); setPeriodoVencFiltro(''); setEmissaoDe(''); setEmissaoAte(''); setVencDe(''); setVencAte(''); setSortConfig(null); }}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
            >
              <X size={14} /> Limpar
            </button>
          )}
        </div>
        </div>

      {(loading || loadingOrcamentos) ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={32} className="text-emerald-400 animate-spin" />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="text-xs uppercase bg-white/[0.03] text-gray-400">
                <tr>
                  <th className="px-6 py-4 font-semibold border-b border-white/5 cursor-pointer hover:bg-white/5" onClick={() => handleSort('CLIENTE_ORC')}>Cliente / Vendedor ↕</th>
                  <th className="px-6 py-4 font-semibold border-b border-white/5 cursor-pointer hover:bg-white/5" onClick={() => handleSort('CODIGO_PRODUTO_ORC')}>Produto ↕</th>
                  <th className="px-6 py-4 font-semibold border-b border-white/5 cursor-pointer hover:bg-white/5" onClick={() => handleSort('ORC_DATA_EMISSAO_ORCAMENTO')}>Datas ↕</th>
                  <th className="px-6 py-4 font-semibold border-b border-white/5 text-right cursor-pointer hover:bg-white/5" onClick={() => handleSort('ORC_VALOR_TOTAL')}>Valores ↕</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {itensPaginados.map((o) => (
                  <tr key={o.id} className="hover:bg-white/[0.02] transition-colors cursor-pointer group" onClick={() => setCliente360({ codigo: o.CODIGO_CLIENTE, loja: o.LOJA_CLIENTE, filial: o.FILIAL_ORC })}>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white group-hover:text-emerald-300 transition-colors">{o.CLIENTE_ORC || '—'}</div>
                      <div className="text-xs text-gray-400 mt-1 uppercase flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-400/50 inline-block"></span>
                        {o.ORC_NOME_VENDEDOR}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-sky-300 font-mono text-xs">{o.CODIGO_PRODUTO_ORC}</div>
                        {(() => {
                          const status = getStatusOrcamento(o) || 'ABERTO';
                          const label = labelStatusOrcamento(status);
                          if (status === 'FATURADO') return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">{label}</span>;
                          if (status === 'CANCELADO') return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/20">{label}</span>;
                          if (status === 'VENCIDO') return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/20">{label}</span>;
                          return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/20">{label}</span>;
                        })()}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">Número: {o.ORC_NUMERO_ORCAMENTO}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 text-gray-400 text-xs">
                        <span className="flex items-center gap-1" title="Emissão"><Calendar size={12}/> {formatDateUI(o.ORC_DATA_EMISSAO_ORCAMENTO)}</span>
                        <span className="text-[10px] text-gray-500" title="Validade">Até {formatDateUI(o.ORC_DATA_ORCAMENTO)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {o.ORC_VALOR_TOTAL !== null ? (
                        <>
                          <div className="font-bold text-emerald-300 text-base">
                            R$ {o.ORC_VALOR_TOTAL.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                          </div>
                          <div className="text-[10px] text-gray-500 uppercase mt-0.5">
                            Unitário: R$ {(o.ORC_VALOR_UNITARIO || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {itensPaginados.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                      Nenhum orçamento encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Controles de Paginação */}
          {filtrados.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-white/[0.02] border-t border-white/5 gap-4">
              <span className="text-sm text-gray-400">
                Mostrando <span className="font-medium text-white">{((paginaAtual - 1) * ITENS_POR_PAGINA) + 1}</span> a{' '}
                <span className="font-medium text-white">{Math.min(paginaAtual * ITENS_POR_PAGINA, filtrados.length)}</span> de{' '}
                <span className="font-medium text-white">{filtrados.length}</span> orçamentos
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                  disabled={paginaAtual === 1}
                  className="p-2 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="text-sm text-gray-400 font-medium px-4">
                  Página {paginaAtual} de {totalPaginas}
                </div>
                <button
                  onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                  disabled={paginaAtual === totalPaginas}
                  className="p-2 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {cliente360 && (
        <Cliente360Modal
          codigoCliente={cliente360.codigo}
          lojaCliente={cliente360.loja}
          filialCliente={cliente360.filial}
          onClose={() => setCliente360(null)}
        />
      )}
    </div>
  );
}
