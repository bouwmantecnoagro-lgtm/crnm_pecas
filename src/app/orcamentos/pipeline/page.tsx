'use client';

import { useState, useMemo } from 'react';
import { Loader2, Flame, Clock, Snowflake, TrendingUp, Zap, ReceiptText, Filter, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import CriarAcaoModal from '@/components/CriarAcaoModal';
import { useData } from '@/contexts/DataContext';
import { getStatusOrcamento } from '@/lib/orcamento';

const PERIODOS = [
  { dias: 30, label: '30 dias' },
  { dias: 90, label: '90 dias' },
  { dias: 180, label: '6 meses' },
  { dias: 365, label: '12 meses' },
  { dias: 0, label: 'Todo período' },
];

export default function PipelineOrcamentos() {
  const { orcamentos, loading, clientes, refreshAcoes, acoes } = useData();
  const [criarAcaoData, setCriarAcaoData] = useState<any>(null);

  // Filtros globais (mesmo padrão do Dashboard) — sem isso o Pipeline acumulava
  // anos de orçamentos abertos e distorcia o Win Rate e os valores das colunas.
  const [fPeriodoDias, setFPeriodoDias] = useState(90);

  const dataLimite = useMemo(() => {
    if (fPeriodoDias === 0) return null;
    const d = new Date();
    d.setDate(d.getDate() - fPeriodoDias);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [fPeriodoDias]);

  const orcamentosFiltrados = useMemo(() => orcamentos.filter((o: any) => {
    if (dataLimite && o.ORC_DATA_EMISSAO_ORCAMENTO) {
      const d = new Date(o.ORC_DATA_EMISSAO_ORCAMENTO);
      if (!isNaN(d.getTime()) && d < dataLimite) return false;
    }
    return true;
  }), [orcamentos, dataLimite]);

  // Vendedores para o modal
  const vendedoresUnicos = Array.from(
    new Map(
      [...clientes.map((c: any) => ({ codigo: c.VENDEDOR_RESP, nome: c.NOME_VENDEDOR_RESP })),
       ...orcamentos.map((o: any) => ({ codigo: o.ORC_CODIGO_VENDEDOR, nome: o.ORC_NOME_VENDEDOR }))]
      .filter(v => v.codigo && v.nome?.trim())
      .map(v => [v.codigo, { codigo: v.codigo, nome: v.nome?.trim() }])
    ).values()
  ).sort((a, b) => a.nome.localeCompare(b.nome));

  // Contar ações ativas por orçamento
  const acoesAtivas = acoes.filter((a: any) => ['PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA'].includes(a.status));
  const acoesPorOrcamento = (numOrc: string) => acoesAtivas.filter((a: any) => a.numero_orcamento === numOrc).length;

  // Lógica de Categorização Automática
  const hoje = new Date();

  // Orçamentos com ação JÁ AGENDADA para o futuro "descansam": guardamos a data da próxima ação.
  // Enquanto essa data não chega, o card sai do estado "precisa de ação" (não fica como abandonado).
  const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
  const proxAcaoPorOrc = new Map<string, string>();
  for (const a of acoesAtivas) {
    if (!a.numero_orcamento || !a.data_vencimento) continue;
    const d = new Date(a.data_vencimento + 'T00:00:00');
    if (isNaN(d.getTime()) || d <= hoje0) continue; // só agendamentos futuros descansam
    const k = String(a.numero_orcamento);
    const cur = proxAcaoPorOrc.get(k);
    if (!cur || a.data_vencimento < cur) proxAcaoPorOrc.set(k, a.data_vencimento);
  }

  const colunas = {
    quentes: { titulo: 'Quentes (0-7 Dias)', cor: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', icone: <Flame size={16} />, items: [] as any[], total: 0 },
    negociacao: { titulo: 'Em Negociação (8-15 Dias)', cor: 'text-sky-400', border: 'border-sky-500/30', bg: 'bg-sky-500/10', icone: <TrendingUp size={16} />, items: [] as any[], total: 0 },
    esfriando: { titulo: 'Esfriando (16-30 Dias)', cor: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10', icone: <Clock size={16} />, items: [] as any[], total: 0 },
    congelados: { titulo: 'Congelados (>30 Dias)', cor: 'text-red-400', border: 'border-red-500/30', bg: 'bg-red-500/10', icone: <Snowflake size={16} />, items: [] as any[], total: 0 },
  };

  const getStatus = getStatusOrcamento;
  const orcAbertos = orcamentosFiltrados.filter(o => { const s = getStatus(o); return !s || s === 'ABERTO' || s === 'EM ABERTO'; });
  const orcFaturados = orcamentosFiltrados.filter(o => getStatus(o) === 'FATURADO');
  // Win Rate = FATURADO / (FATURADO + CANCELADO + VENCIDO). VENCIDO conta como perda (decisão 2026-05-12).
  const fechadosCount = orcamentosFiltrados.filter(o => ['FATURADO', 'CANCELADO', 'VENCIDO'].includes(getStatus(o))).length;
  const winRate = fechadosCount > 0
    ? ((orcFaturados.length / fechadosCount) * 100).toFixed(1)
    : '0.0';
  const totalFaturado = orcFaturados.reduce((acc, curr) => acc + (curr.ORC_VALOR_TOTAL || 0), 0);
  const filtroAtivo = fPeriodoDias !== 90;

  orcAbertos.forEach(o => {
    if (!o.ORC_DATA_EMISSAO_ORCAMENTO) return;
    
    const dataEmissao = new Date(o.ORC_DATA_EMISSAO_ORCAMENTO);
    const diasAberto = Math.floor((hoje.getTime() - dataEmissao.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diasAberto <= 7) {
      colunas.quentes.items.push({...o, diasAberto});
      colunas.quentes.total += (o.ORC_VALOR_TOTAL || 0);
    } else if (diasAberto <= 15) {
      colunas.negociacao.items.push({...o, diasAberto});
      colunas.negociacao.total += (o.ORC_VALOR_TOTAL || 0);
    } else if (diasAberto <= 30) {
      colunas.esfriando.items.push({...o, diasAberto});
      colunas.esfriando.total += (o.ORC_VALOR_TOTAL || 0);
    } else {
      colunas.congelados.items.push({...o, diasAberto});
      colunas.congelados.total += (o.ORC_VALOR_TOTAL || 0);
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 size={48} className="text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 h-full flex flex-col">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white mb-2">Pipeline de Orçamentos</h1>
          <p className="text-gray-400">Visão preditiva baseada no tempo de abertura. Foco no preenchimento do funil.</p>
        </div>
        <div className="flex gap-4">
          <Link href="/orcamentos" className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg text-sm font-medium transition-colors">
            Ver em Tabela
          </Link>
        </div>
      </header>

      {/* BARRA DE FILTRO DE PERÍODO */}
      <div className={`glass-panel p-3 flex flex-wrap items-center gap-3 border shrink-0 ${filtroAtivo ? 'border-sky-500/30 bg-sky-500/[0.02]' : 'border-white/5'}`}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400 pr-2 border-r border-white/10">
          <Filter size={14} className={filtroAtivo ? 'text-sky-400' : 'text-gray-500'} />
          Filtro de período (emissão)
        </div>
        <select
          className="bg-black/30 border border-white/10 text-sm rounded px-3 py-1.5 text-gray-200 focus:outline-none focus:border-sky-500"
          value={fPeriodoDias}
          onChange={e => setFPeriodoDias(Number(e.target.value))}
        >
          {PERIODOS.map(p => <option key={p.dias} value={p.dias}>{p.label}</option>)}
        </select>
        <span className="text-xs text-gray-500">
          {orcAbertos.length} abertos • {fechadosCount} fechados no período
        </span>
        {filtroAtivo && (
          <button onClick={() => setFPeriodoDias(90)} className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 px-2 py-1.5 transition-colors ml-auto">
            <RotateCcw size={12} /> Voltar a 90 dias
          </button>
        )}
      </div>

      {/* KPIs Rápidos de Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2 shrink-0">
         <div className="glass-panel p-4 border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between">
            <div>
               <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Win Rate</p>
               <h3 className="text-2xl font-bold text-emerald-400">{winRate}%</h3>
            </div>
            <TrendingUp className="text-emerald-500/50" size={32} />
         </div>
         <div className="glass-panel p-4 border border-sky-500/20 bg-sky-500/5 flex items-center justify-between">
            <div>
               <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Pipeline Ativo</p>
               <h3 className="text-2xl font-bold text-sky-400">R$ {orcAbertos.reduce((acc, curr) => acc + (curr.ORC_VALOR_TOTAL || 0), 0).toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</h3>
            </div>
            <ReceiptText className="text-sky-500/50" size={32} />
         </div>
         <div className="glass-panel p-4 border border-amber-500/20 bg-amber-500/5 flex items-center justify-between">
            <div>
               <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Total Ganho</p>
               <h3 className="text-2xl font-bold text-amber-400">R$ {totalFaturado.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</h3>
            </div>
            <Zap className="text-amber-500/50" size={32} />
         </div>
      </div>

      {/* KANBAN BOARD */}
      <div className="flex gap-6 overflow-x-auto pb-4 pt-1 flex-1 min-h-[400px] pr-8 after:content-[''] after:w-4 after:shrink-0">
        {Object.entries(colunas).map(([chave, coluna]) => (
          <div key={chave} className="flex-none w-80 flex flex-col h-full bg-[#ffffff02] rounded-xl border border-white/5">
            {/* Header da Coluna */}
            <div className={`p-4 border-b ${coluna.border} ${coluna.bg} rounded-t-xl shrink-0`}>
              <div className={`flex items-center gap-2 font-bold ${coluna.cor} mb-1 uppercase tracking-wider text-sm`}>
                {coluna.icone} {coluna.titulo}
              </div>
              <div className="flex justify-between items-end">
                <span className="text-2xl font-bold text-white">R$ {coluna.total.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-xs text-gray-400 font-medium bg-black/40 px-2 py-0.5 rounded-full">{coluna.items.length} itens</span>
                  {(() => {
                    const ag = coluna.items.filter((o: any) => proxAcaoPorOrc.has(String(o.ORC_NUMERO_ORCAMENTO))).length;
                    return ag > 0 ? <span className="text-[10px] text-emerald-400/80">{ag} agendado{ag > 1 ? 's' : ''}</span> : null;
                  })()}
                </div>
              </div>
            </div>

            {/* Cards da Coluna */}
            <div className="p-3 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
              {coluna.items.sort((a, b) => {
                  const da = proxAcaoPorOrc.has(String(a.ORC_NUMERO_ORCAMENTO)) ? 1 : 0;
                  const db = proxAcaoPorOrc.has(String(b.ORC_NUMERO_ORCAMENTO)) ? 1 : 0;
                  if (da !== db) return da - db; // agendados (descansando) vão pro fim da coluna
                  return b.ORC_VALOR_TOTAL - a.ORC_VALOR_TOTAL;
                }).map((o, i) => {
                const numAcoes = acoesPorOrcamento(String(o.ORC_NUMERO_ORCAMENTO));
                const proxAcao = proxAcaoPorOrc.get(String(o.ORC_NUMERO_ORCAMENTO));
                const fmtVenc = proxAcao ? new Date(proxAcao + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : null;
                return (
                <div key={i} className={`glass-panel p-4 cursor-pointer hover:border-white/20 transition-all hover:-translate-y-1 group relative ${proxAcao ? 'opacity-60 hover:opacity-100' : ''}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold bg-white/10 text-gray-300 px-2 py-0.5 rounded uppercase">{o.ORC_NUMERO_ORCAMENTO}</span>
                      {numAcoes > 0 && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full border border-violet-500/20">
                          <Zap size={8} /> {numAcoes}
                        </span>
                      )}
                    </div>
                    {proxAcao ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" title={`Próxima ação agendada para ${fmtVenc} — em tratativa`}>
                        <Clock size={9} /> Agendado {fmtVenc}
                      </span>
                    ) : (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${coluna.bg} ${coluna.cor}`}>
                        {o.diasAberto}d
                      </span>
                    )}
                  </div>
                  <h4 className="font-semibold text-gray-100 text-sm leading-tight mb-1 group-hover:text-white line-clamp-2" title={o.CLIENTE_ORC}>
                    {o.CLIENTE_ORC || 'Cliente Não Identificado'}
                  </h4>
                  <div className="font-mono text-xs text-amber-400/80 mb-3 truncate" title={o.CODIGO_PRODUTO_ORC}>
                    {o.CODIGO_PRODUTO_ORC}
                  </div>
                  
                  <div className="pt-3 border-t border-white/5 flex justify-between items-center gap-2">
                    <div className="text-[10px] uppercase text-gray-500 font-medium flex items-center gap-1 overflow-hidden">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0"></span>
                      <span className="truncate">{o.ORC_NOME_VENDEDOR?.split(' ')[0] || 'Vendedor'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Botão Criar Ação */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCriarAcaoData({
                            clienteCodigo: o.CODIGO_CLIENTE,
                            clienteLoja: o.LOJA_CLIENTE,
                            clienteNome: o.CLIENTE_ORC,
                            numeroOrcamento: String(o.ORC_NUMERO_ORCAMENTO),
                            tipoSugerido: 'FOLLOW_UP_ORCAMENTO',
                          });
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-lg transition-all hover:bg-violet-500/20"
                        title="Criar ação para este orçamento"
                      >
                        <Zap size={12} />
                      </button>
                      <div className="font-bold text-emerald-300 text-sm shrink-0">
                        R$ {o.ORC_VALOR_TOTAL.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                      </div>
                    </div>
                  </div>
                </div>
              )})}
              
              {coluna.items.length === 0 && (
                <div className="h-24 flex items-center justify-center border-2 border-dashed border-white/5 rounded-lg text-sm text-gray-600 font-medium italic">
                  Nenhum orçamento
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Estilo para a scrollbar customizada do Kanban */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}} />

      {/* MODAL CRIAR AÇÃO */}
      {criarAcaoData && (
        <CriarAcaoModal
          clienteCodigo={criarAcaoData.clienteCodigo}
          clienteLoja={criarAcaoData.clienteLoja}
          clienteNome={criarAcaoData.clienteNome}
          numeroOrcamento={criarAcaoData.numeroOrcamento}
          tipoSugerido={criarAcaoData.tipoSugerido}
          origemTela="PIPELINE"
          vendedores={vendedoresUnicos}
          onClose={() => setCriarAcaoData(null)}
          onSave={refreshAcoes}
        />
      )}
    </div>
  );
}
