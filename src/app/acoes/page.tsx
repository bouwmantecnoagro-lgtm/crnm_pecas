'use client';

import { useEffect, useState } from 'react';
import { Zap, Clock, CheckCircle2, XCircle, RotateCcw, Filter, Plus, BarChart3, AlertTriangle, TrendingUp, Users, Loader2 } from 'lucide-react';
import AcaoCard from '@/components/AcaoCard';
import { getCategoriaAcao, CATEGORIAS_ACAO } from '@/lib/acao';
import CriarAcaoModal from '@/components/CriarAcaoModal';
import ConcluirAcaoModal from '@/components/ConcluirAcaoModal';
import EditarAcaoModal from '@/components/EditarAcaoModal';
import Cliente360Modal from '@/components/Cliente360Modal';
import { useData } from '@/contexts/DataContext';

export default function PainelAcoes() {
  const { acoes, loading, refreshAcoes, clientes, orcamentos } = useData();
  const [filtroStatus, setFiltroStatus] = useState('ATIVAS');
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroPrioridade, setFiltroPrioridade] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [criarModal, setCriarModal] = useState(false);
  const [concluirAcao, setConcluirAcao] = useState<any>(null);
  const [editarAcao, setEditarAcao] = useState<any>(null);
  const [visao, setVisao] = useState<'kanban' | 'lista'>('kanban');
  const [draggedAcaoId, setDraggedAcaoId] = useState<number | string | null>(null);
  const [cliente360, setCliente360] = useState<{codigo: string, loja: string} | null>(null);

  // Extrair vendedores únicos dos dados já carregados
  const vendedoresUnicos = Array.from(
    new Map(
      [...clientes.map((c: any) => ({ codigo: c.VENDEDOR_RESP, nome: c.NOME_VENDEDOR_RESP })),
       ...orcamentos.map((o: any) => ({ codigo: o.ORC_CODIGO_VENDEDOR, nome: o.ORC_NOME_VENDEDOR }))]
      .filter(v => v.codigo && v.nome?.trim())
      .map(v => [v.codigo, { codigo: v.codigo, nome: v.nome?.trim() }])
    ).values()
  ).sort((a, b) => a.nome.localeCompare(b.nome));

  // Filtrar ações
  const acoesFiltradas = acoes.filter((a: any) => {
    if (filtroStatus === 'ATIVAS' && !['PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA'].includes(a.status)) return false;
    if (filtroStatus && filtroStatus !== 'ATIVAS' && a.status !== filtroStatus) return false;
    if (filtroVendedor && a.vendedor_responsavel !== filtroVendedor) return false;
    if (filtroPrioridade && a.prioridade !== filtroPrioridade) return false;
    if (filtroCategoria && getCategoriaAcao(a).key !== filtroCategoria) return false;
    return true;
  });

  // Métricas
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const acoesAtivas = acoes.filter((a: any) => ['PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA'].includes(a.status));
  const acoesVencidas = acoesAtivas.filter((a: any) => {
    if (!a.data_vencimento) return false;
    return new Date(a.data_vencimento + 'T00:00:00') < hoje;
  });
  const acoesConcluidas = acoes.filter((a: any) => a.status === 'CONCLUIDA');
  const taxaConclusao = acoes.length > 0 ? Math.round((acoesConcluidas.length / acoes.length) * 100) : 0;

  // Agrupar por status para Kanban
  const kanbanColunas = {
    PENDENTE: { titulo: 'Pendentes', cor: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10', icone: <Clock size={16} />, items: [] as any[] },
    EM_ANDAMENTO: { titulo: 'Em Andamento', cor: 'text-sky-400', border: 'border-sky-500/30', bg: 'bg-sky-500/10', icone: <RotateCcw size={16} />, items: [] as any[] },
    CONCLUIDA: { titulo: 'Concluídas', cor: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', icone: <CheckCircle2 size={16} />, items: [] as any[] },
    CANCELADA: { titulo: 'Canceladas', cor: 'text-red-400', border: 'border-red-500/30', bg: 'bg-red-500/10', icone: <XCircle size={16} />, items: [] as any[] },
  };

  const acoesParaKanban = acoes.filter((a: any) => {
    if (filtroVendedor && a.vendedor_responsavel !== filtroVendedor) return false;
    if (filtroPrioridade && a.prioridade !== filtroPrioridade) return false;
    if (filtroCategoria && getCategoriaAcao(a).key !== filtroCategoria) return false;
    return true;
  });

  acoesParaKanban.forEach((a: any) => {
    const status = a.status === 'REAGENDADA' ? 'PENDENTE' : a.status;
    if (kanbanColunas[status as keyof typeof kanbanColunas]) {
      kanbanColunas[status as keyof typeof kanbanColunas].items.push(a);
    }
  });

  // Ranking de vendedores por ações
  const rankingVendedores = Array.from(
    acoesAtivas.reduce((acc: Map<string, any>, a: any) => {
      const key = a.vendedor_responsavel || 'SEM';
      if (!acc.has(key)) acc.set(key, { nome: a.nome_vendedor || 'Sem vendedor', total: 0, concluidas: 0, vencidas: 0 });
      const v = acc.get(key)!;
      v.total++;
      if (acoesVencidas.find((av: any) => av.id === a.id)) v.vencidas++;
      return acc;
    }, new Map()).values()
  ).sort((a: any, b: any) => b.total - a.total);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 size={48} className="text-violet-400 animate-spin" />
      </div>
    );
  }

  const handleDrop = async (e: React.DragEvent, novoStatus: string) => {
    e.preventDefault();
    if (!draggedAcaoId) return;

    try {
      const res = await fetch(`/api/acoes/${draggedAcaoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus }),
      });
      if (res.ok) {
        refreshAcoes();
      }
    } catch (err) {
      console.error('Erro ao mover ação', err);
    } finally {
      setDraggedAcaoId(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 h-full flex flex-col">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white mb-2 flex items-center gap-3">
            <Zap size={28} className="text-violet-400" /> Painel de Ações
          </h1>
          <p className="text-gray-400">Gerencie e monitore todas as ações comerciais da equipe.</p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-white/5 rounded-lg border border-white/10 overflow-hidden">
            <button onClick={() => setVisao('kanban')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${visao === 'kanban' ? 'bg-violet-500/20 text-violet-400' : 'text-gray-500 hover:text-gray-300'}`}>Kanban</button>
            <button onClick={() => setVisao('lista')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${visao === 'lista' ? 'bg-violet-500/20 text-violet-400' : 'text-gray-500 hover:text-gray-300'}`}>Lista</button>
          </div>
          <button
            onClick={() => setCriarModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-violet-600 to-sky-600 hover:from-violet-500 hover:to-sky-500 text-white text-sm font-bold rounded-lg flex items-center gap-2 shadow-lg shadow-violet-500/20 transition-all"
          >
            <Plus size={16} /> Nova Ação
          </button>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
        <div className="glass-panel p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Clock size={18} className="text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-white">{acoesAtivas.length}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Ações Ativas</p>
          </div>
        </div>
        <div className={`glass-panel p-4 flex items-center gap-3 ${acoesVencidas.length > 0 ? 'border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.05)]' : ''}`}>
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle size={18} className="text-red-400" />
          </div>
          <div>
            <p className={`text-2xl font-black ${acoesVencidas.length > 0 ? 'text-red-400' : 'text-white'}`}>{acoesVencidas.length}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Vencidas</p>
          </div>
        </div>
        <div className="glass-panel p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <TrendingUp size={18} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-emerald-400">{taxaConclusao}%</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Taxa Conclusão</p>
          </div>
        </div>
        <div className="glass-panel p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <CheckCircle2 size={18} className="text-sky-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-white">{acoesConcluidas.length}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Concluídas</p>
          </div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex flex-wrap gap-2 shrink-0">
        <Filter size={14} className="text-gray-500 mt-1.5" />
        <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} className="bg-black/30 border border-white/10 text-xs rounded-lg px-3 py-1.5 text-gray-300 focus:outline-none focus:border-violet-500/50">
          <option value="">Todos os Vendedores</option>
          {vendedoresUnicos.map((v: any) => <option key={v.codigo} value={v.codigo}>{v.nome}</option>)}
        </select>
        <select value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)} className="bg-black/30 border border-white/10 text-xs rounded-lg px-3 py-1.5 text-gray-300 focus:outline-none focus:border-violet-500/50">
          <option value="">Todas as Prioridades</option>
          <option value="URGENTE">🔴 Urgente</option>
          <option value="ALTA">🟠 Alta</option>
          <option value="MEDIA">🟡 Média</option>
          <option value="BAIXA">⚪ Baixa</option>
        </select>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFiltroCategoria('')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${filtroCategoria === '' ? 'bg-white/15 text-white border-white/25' : 'bg-white/[0.02] text-gray-500 border-white/10 hover:text-gray-300'}`}
          >
            Todas
          </button>
          {CATEGORIAS_ACAO.map(c => (
            <button
              key={c.key}
              onClick={() => setFiltroCategoria(filtroCategoria === c.key ? '' : c.key)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${filtroCategoria === c.key ? c.chip : 'bg-white/[0.02] text-gray-500 border-white/10 hover:text-gray-300'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {visao === 'lista' && (
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="bg-black/30 border border-white/10 text-xs rounded-lg px-3 py-1.5 text-gray-300 focus:outline-none focus:border-violet-500/50">
            <option value="ATIVAS">Ativas (Pendente + Em Andamento)</option>
            <option value="PENDENTE">Pendentes</option>
            <option value="EM_ANDAMENTO">Em Andamento</option>
            <option value="CONCLUIDA">Concluídas</option>
            <option value="CANCELADA">Canceladas</option>
            <option value="">Todas</option>
          </select>
        )}
        {(filtroVendedor || filtroPrioridade || filtroCategoria) && (
          <button onClick={() => { setFiltroVendedor(''); setFiltroPrioridade(''); setFiltroCategoria(''); }} className="text-red-400 text-xs flex items-center gap-1 px-2 hover:text-red-300">
            <XCircle size={12} /> Limpar
          </button>
        )}
      </div>

      {/* CONTEÚDO: KANBAN ou LISTA */}
      {visao === 'kanban' ? (
        <div className="flex gap-6 overflow-x-auto pb-4 pt-1 flex-1 min-h-[400px] pr-8 after:content-[''] after:w-4 after:shrink-0">
          {Object.entries(kanbanColunas).map(([chave, coluna]) => (
            <div 
              key={chave} 
              className="flex-none w-80 flex flex-col h-full bg-[#ffffff02] rounded-xl border border-white/5 transition-colors duration-200 hover:bg-[#ffffff05]"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, chave)}
            >
              <div className={`p-4 border-b ${coluna.border} ${coluna.bg} rounded-t-xl shrink-0`}>
                <div className={`flex items-center justify-between font-bold ${coluna.cor} uppercase tracking-wider text-sm`}>
                  <div className="flex items-center gap-2">{coluna.icone} {coluna.titulo}</div>
                  <span className="text-xs font-black bg-black/40 px-2 py-1 rounded-md text-white">{coluna.items.length}</span>
                </div>
              </div>
              <div className="p-3 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                {coluna.items
                  .sort((a: any, b: any) => {
                    // Ordena por data de vencimento (mais próxima/atrasada primeiro); sem data vai pro fim.
                    // Empate na data: prioridade. Assim ações reagendadas afloram pela nova data.
                    const da = a.data_vencimento ? new Date(a.data_vencimento + 'T00:00:00').getTime() : Infinity;
                    const db = b.data_vencimento ? new Date(b.data_vencimento + 'T00:00:00').getTime() : Infinity;
                    if (da !== db) return da - db;
                    const prioOrder: Record<string, number> = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
                    return (prioOrder[a.prioridade] ?? 2) - (prioOrder[b.prioridade] ?? 2);
                  })
                  .map((acao: any) => (
                  <AcaoCard
                    key={acao.id}
                    acao={acao}
                    onConcluir={acao.status !== 'CONCLUIDA' && acao.status !== 'CANCELADA' ? () => setConcluirAcao(acao) : undefined}
                    onEdit={() => setEditarAcao(acao)}
                    onClickCliente={acao.codigo_cliente ? (cod, loja) => setCliente360({ codigo: cod, loja }) : undefined}
                    onDragStart={(e) => {
                      setDraggedAcaoId(acao.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', acao.id.toString());
                    }}
                  />
                ))}
                {coluna.items.length === 0 && (
                  <div className="h-24 flex items-center justify-center border-2 border-dashed border-white/5 rounded-lg text-sm text-gray-600 font-medium italic">
                    Nenhuma ação
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
          {acoesFiltradas.length === 0 ? (
            <div className="flex items-center justify-center h-48 glass-panel">
              <div className="text-center">
                <Zap size={40} className="text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500">Nenhuma ação encontrada com esses filtros.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {acoesFiltradas.map((acao: any) => (
                <AcaoCard
                  key={acao.id}
                  acao={acao}
                  onConcluir={acao.status !== 'CONCLUIDA' && acao.status !== 'CANCELADA' ? () => setConcluirAcao(acao) : undefined}
                  onEdit={() => setEditarAcao(acao)}
                  onClickCliente={acao.codigo_cliente ? (cod, loja) => setCliente360({ codigo: cod, loja }) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* RODAPÉ INFORMATIVO */}
      <div className="shrink-0 mt-4 p-5 glass-panel border border-violet-500/20 bg-[#ffffff02] rounded-xl flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-violet-500/10 border border-violet-500/30 flex items-center justify-center shrink-0">
          <Zap size={18} className="text-violet-400" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-white mb-2">Como funcionam as Ações Automáticas?</h4>
          <p className="text-sm text-gray-400 leading-relaxed">
            O CRM Bouwman analisa sua carteira todo dia e gera tarefas automaticamente para os consultores com base em 2 regras:<br/>
            <strong className="text-gray-300">1. Prevenção de Evasão (Churn):</strong> Se um cliente ativo ficar <strong>mais de 120 dias</strong> sem efetuar compras, uma ação de <em>Resgate</em> será criada.<br/>
            <strong className="text-gray-300">2. Acompanhamento Comercial (Follow-up):</strong> Orçamentos quentes que chegarem a <strong>15 dias</strong> sem fechamento entrarão automaticamente para o funil de recontato. 
          </p>
        </div>
      </div>

      {/* Scrollbar style */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
      `}} />

      {/* MODAIS */}
      {criarModal && (
        <CriarAcaoModal
          origemTela="PAINEL_ACOES"
          vendedores={vendedoresUnicos}
          onClose={() => setCriarModal(false)}
          onSave={refreshAcoes}
        />
      )}
      {concluirAcao && (
        <ConcluirAcaoModal
          acao={concluirAcao}
          onClose={() => setConcluirAcao(null)}
          onSave={refreshAcoes}
        />
      )}
      {cliente360 && (
        <Cliente360Modal 
          codigoCliente={cliente360.codigo} 
          lojaCliente={cliente360.loja} 
          onClose={() => setCliente360(null)} 
        />
      )}
      {editarAcao && (
        <EditarAcaoModal
          acao={editarAcao}
          vendedores={vendedoresUnicos}
          onClose={() => setEditarAcao(null)}
          onSave={refreshAcoes}
        />
      )}
    </div>
  );
}
