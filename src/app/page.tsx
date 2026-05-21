'use client';

import { useState, useMemo } from 'react';
import { AlertCircle, ChevronRight, MapPin, ReceiptText, Tractor, TrendingUp, Users, X, Loader2, Database, Zap, Filter, Award, AlertTriangle, RotateCcw, Hourglass, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, Cell, LabelList } from 'recharts';
import Link from 'next/link';
import Cliente360Modal from '@/components/Cliente360Modal';
import AcaoCard from '@/components/AcaoCard';
import ConcluirAcaoModal from '@/components/ConcluirAcaoModal';

import { useData } from '@/contexts/DataContext';
import { getStatusOrcamento as getStatusOrc, STATUS_FECHADOS } from '@/lib/orcamento';

const PERIODOS = [
  { dias: 30, label: '30 dias' },
  { dias: 90, label: '90 dias' },
  { dias: 180, label: '6 meses' },
  { dias: 365, label: '12 meses' },
  { dias: 0, label: 'Todo período' },
];

export default function Dashboard() {
  const { clientes, orcamentos, maquinas, loading, ultimaSync, acoes, refreshAcoes } = useData();
  const [vendedorSelecionado, setVendedorSelecionado] = useState<any>(null);
  const [clienteModal, setClienteModal] = useState<{codigo: string, loja: string} | null>(null);
  const [concluirAcao, setConcluirAcao] = useState<any>(null);

  // === Filtros globais do dashboard ===
  const [fVendedor, setFVendedor] = useState('');
  const [fFilial, setFFilial] = useState('');
  const [fPeriodoDias, setFPeriodoDias] = useState(90);

  // Filtros adicionais (refinamento dentro do bloco Cross-Sell)
  const [crossFilial, setCrossFilial] = useState('');
  const [crossFabricante, setCrossFabricante] = useState('');
  const [crossModelo, setCrossModelo] = useState('');
  const [crossVendedor, setCrossVendedor] = useState('');

  // === Opções dos combos de filtro ===
  const vendedoresDisponiveis = useMemo(() => {
    const map = new Map<string, string>();
    clientes.forEach((c: any) => {
      if (c.VENDEDOR_RESP && c.NOME_VENDEDOR_RESP) map.set(String(c.VENDEDOR_RESP), String(c.NOME_VENDEDOR_RESP).trim());
    });
    orcamentos.forEach((o: any) => {
      if (o.ORC_CODIGO_VENDEDOR && o.ORC_NOME_VENDEDOR) map.set(String(o.ORC_CODIGO_VENDEDOR), String(o.ORC_NOME_VENDEDOR).trim());
    });
    return Array.from(map.entries()).map(([codigo, nome]) => ({ codigo, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [clientes, orcamentos]);

  const filiaisDisponiveis = useMemo(() => {
    const set = new Set<string>();
    clientes.forEach((c: any) => { if (c.FILIAL) set.add(String(c.FILIAL)); });
    orcamentos.forEach((o: any) => { if (o.FILIAL_ORC) set.add(String(o.FILIAL_ORC)); });
    maquinas.forEach((m: any) => { if (m.FILIAL) set.add(String(m.FILIAL)); });
    return Array.from(set).sort();
  }, [clientes, orcamentos, maquinas]);

  // Nome do vendedor selecionado — necessário para entidades que só têm o nome (máquinas)
  const nomeVendedorSelecionado = useMemo(() => {
    if (!fVendedor) return '';
    return vendedoresDisponiveis.find(v => v.codigo === fVendedor)?.nome || '';
  }, [fVendedor, vendedoresDisponiveis]);

  // Limite de data com base no período selecionado
  const dataLimite = useMemo(() => {
    if (fPeriodoDias === 0) return null;
    const d = new Date();
    d.setDate(d.getDate() - fPeriodoDias);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [fPeriodoDias]);

  // === Aplicação dos filtros globais a cada coleção ===
  // Clientes: filtro de período não se aplica (carteira é estado atual)
  const clientesFiltrados = useMemo(() => clientes.filter((c: any) => {
    if (fVendedor && String(c.VENDEDOR_RESP || '') !== fVendedor) return false;
    if (fFilial && String(c.FILIAL || '') !== fFilial) return false;
    return true;
  }), [clientes, fVendedor, fFilial]);

  const orcamentosFiltrados = useMemo(() => orcamentos.filter((o: any) => {
    if (fVendedor && String(o.ORC_CODIGO_VENDEDOR || '') !== fVendedor) return false;
    if (fFilial && String(o.FILIAL_ORC || '') !== fFilial) return false;
    if (dataLimite && o.ORC_DATA_EMISSAO_ORCAMENTO) {
      const d = new Date(o.ORC_DATA_EMISSAO_ORCAMENTO);
      if (!isNaN(d.getTime()) && d < dataLimite) return false;
    }
    return true;
  }), [orcamentos, fVendedor, fFilial, dataLimite]);

  const maquinasFiltradas = useMemo(() => maquinas.filter((m: any) => {
    if (nomeVendedorSelecionado) {
      const nm = String(m.NOME_VENDEDOR || '').trim().toUpperCase();
      if (nm !== nomeVendedorSelecionado.toUpperCase()) return false;
    }
    if (fFilial && String(m.FILIAL || '') !== fFilial) return false;
    if (dataLimite && m.EMISSAO) {
      const dt = new Date(m.EMISSAO.toString().includes('Date') ? parseInt(m.EMISSAO.match(/\d+/)![0]) : m.EMISSAO);
      if (!isNaN(dt.getTime()) && dt < dataLimite) return false;
    }
    return true;
  }), [maquinas, nomeVendedorSelecionado, fFilial, dataLimite]);

  // Para ações: filial vem do cliente vinculado (a tabela crm_acoes não tem filial)
  const clienteFilialIdx = useMemo(() => {
    const idx = new Map<string, string>();
    clientes.forEach((c: any) => idx.set(`${c.CODIGO_CLIENTE}_${c.LOJA_CLIENTE}`, String(c.FILIAL || '')));
    return idx;
  }, [clientes]);

  const acoesFiltradas = useMemo(() => acoes.filter((a: any) => {
    if (fVendedor && String(a.vendedor_responsavel || '') !== fVendedor) return false;
    if (fFilial && a.codigo_cliente) {
      const fil = clienteFilialIdx.get(`${a.codigo_cliente}_${a.loja_cliente}`);
      if (fil && fil !== fFilial) return false;
    }
    return true;
  }), [acoes, fVendedor, fFilial, clienteFilialIdx]);

  // === Cálculos derivados (sobre os filtrados) ===
  const clientesEmRisco = useMemo(() => clientesFiltrados.filter((c: any) => (c.DIAS_SEM_COMPRA || 0) > 90), [clientesFiltrados]);
  const totalAtivos = useMemo(() => clientesFiltrados.filter((c: any) => c.STATUS_BASE === 'ATIVO').length, [clientesFiltrados]);

  // Buckets pela nova coluna STATUS
  // Exige Status explícito 'ABERTO'/'EM ABERTO'. NÃO aceita null/vazio: a investigação
  // de 2026-05-21 mostrou 707 registros legacy com Status=null que o ERP não devolve
  // mais (provavelmente já faturados/cancelados fora da janela do SELECT da sync),
  // mas que ficaram no Supabase porque UPSERT não os apaga. Eles inflavam o card em
  // ~R$ 2.7M sem refletir pipeline ativo.
  const orcAbertos = useMemo(() => orcamentosFiltrados.filter((o: any) => { const s = getStatusOrc(o); return s === 'ABERTO' || s === 'EM ABERTO'; }), [orcamentosFiltrados]);

  // Quantidade de orçamentos únicos (cada ORC_NUMERO_ORCAMENTO tem N linhas de item).
  // Usado no subtitle do card pra evitar a confusão "N orçamentos pendentes" quando
  // na verdade são N ITENS distribuídos em K orçamentos.
  const orcAbertosUnicos = useMemo(() => new Set(orcAbertos.map((o: any) => o.ORC_NUMERO_ORCAMENTO).filter(Boolean)).size, [orcAbertos]);
  const orcFaturados = useMemo(() => orcamentosFiltrados.filter((o: any) => getStatusOrc(o) === 'FATURADO'), [orcamentosFiltrados]);
  const orcCancelados = useMemo(() => orcamentosFiltrados.filter((o: any) => getStatusOrc(o) === 'CANCELADO'), [orcamentosFiltrados]);
  const orcVencidos = useMemo(() => orcamentosFiltrados.filter((o: any) => getStatusOrc(o) === 'VENCIDO'), [orcamentosFiltrados]);

  // Subconjunto: vencidos cuja data de validade (ORC_DATA_ORCAMENTO) caiu nos últimos 30 dias.
  // Usado pela rotina "estender +7 dias" do Vanderlei — oportunidades quentes de recuperação.
  const orcVencidos30d = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const limite = new Date(hoje); limite.setDate(limite.getDate() - 30);
    return orcVencidos.filter((o: any) => {
      const venc = o.ORC_DATA_ORCAMENTO;
      if (!venc) return false;
      const d = new Date(String(venc) + 'T00:00:00');
      return d >= limite && d <= hoje;
    });
  }, [orcVencidos]);
  const totalVencidos30d = useMemo(() => orcVencidos30d.reduce((acc, c) => acc + (c.ORC_VALOR_TOTAL || 0), 0), [orcVencidos30d]);

  const totalAbertos = useMemo(() => orcAbertos.reduce((acc, c) => acc + (c.ORC_VALOR_TOTAL || 0), 0), [orcAbertos]);
  const totalFaturado = useMemo(() => orcFaturados.reduce((acc, c) => acc + (c.ORC_VALOR_TOTAL || 0), 0), [orcFaturados]);
  const totalCancelado = useMemo(() => orcCancelados.reduce((acc, c) => acc + (c.ORC_VALOR_TOTAL || 0), 0), [orcCancelados]);
  const totalVencido = useMemo(() => orcVencidos.reduce((acc, c) => acc + (c.ORC_VALOR_TOTAL || 0), 0), [orcVencidos]);

  const fechadosQtd = orcFaturados.length + orcCancelados.length + orcVencidos.length;
  const fechadosValor = totalFaturado + totalCancelado + totalVencido;

  const winRateQtd = fechadosQtd > 0 ? (orcFaturados.length / fechadosQtd) * 100 : 0;
  const winRateValor = fechadosValor > 0 ? (totalFaturado / fechadosValor) * 100 : 0;
  const taxaCancelamento = fechadosQtd > 0 ? (orcCancelados.length / fechadosQtd) * 100 : 0;
  const taxaVencimento = fechadosQtd > 0 ? (orcVencidos.length / fechadosQtd) * 100 : 0;

  // Ranking de Eficácia por Vendedor (amostra mínima 3 fechados para evitar ruído)
  const rankingEficacia = useMemo(() => {
    const map = new Map<string, { nome: string; faturados: number; cancelados: number; vencidos: number; valorFat: number; valorFechado: number }>();
    orcamentosFiltrados.forEach((o: any) => {
      const s = getStatusOrc(o);
      if (!STATUS_FECHADOS.has(s)) return;
      const nome = (o.ORC_NOME_VENDEDOR || 'NÃO IDENTIFICADO').trim();
      if (!map.has(nome)) map.set(nome, { nome, faturados: 0, cancelados: 0, vencidos: 0, valorFat: 0, valorFechado: 0 });
      const r = map.get(nome)!;
      const v = o.ORC_VALOR_TOTAL || 0;
      r.valorFechado += v;
      if (s === 'FATURADO') { r.faturados++; r.valorFat += v; }
      else if (s === 'CANCELADO') r.cancelados++;
      else if (s === 'VENCIDO') r.vencidos++;
    });
    return Array.from(map.values())
      .map(r => {
        const total = r.faturados + r.cancelados + r.vencidos;
        return {
          ...r,
          totalFechados: total,
          winRateQtd: total > 0 ? (r.faturados / total) * 100 : 0,
          winRateValor: r.valorFechado > 0 ? (r.valorFat / r.valorFechado) * 100 : 0,
        };
      })
      .filter(r => r.totalFechados >= 3)
      .sort((a, b) => b.winRateQtd - a.winRateQtd)
      .slice(0, 10);
  }, [orcamentosFiltrados]);

  // Ranking de Volume (todos os orçamentos, não só fechados) — agora sobre filtrados
  const rankingVendedores = useMemo(() => Object.values(orcamentosFiltrados.reduce((acc: any, curr: any) => {
    const vendedor = (curr.ORC_NOME_VENDEDOR || 'NÃO IDENTIFICADO').trim();
    if (!acc[vendedor]) acc[vendedor] = { nome: vendedor, total: 0, quantidade: 0, orcamentos: [] as any[] };
    acc[vendedor].total += (curr.ORC_VALOR_TOTAL || 0);
    acc[vendedor].quantidade += 1;
    acc[vendedor].orcamentos.push(curr);
    return acc;
  }, {} as Record<string, any>))
  .sort((a: any, b: any) => b.total - a.total).slice(0, 8) as any[], [orcamentosFiltrados]);

  // Funil de orçamentos abertos por idade
  const funilOrcamentos = useMemo(() => {
    const raw = [
      { name: 'Recentes (0-7d)', maxD: 7, valor: 0, color: '#34d399' },
      { name: 'Mornos (8-15d)', maxD: 15, valor: 0, color: '#fbbf24' },
      { name: 'Esfriando (16-30d)', maxD: 30, valor: 0, color: '#fb923c' },
      { name: 'Congelados (>30d)', maxD: 9999, valor: 0, color: '#ef4444' },
    ];
    orcAbertos.forEach((o: any) => {
      if (!o.ORC_DATA_EMISSAO_ORCAMENTO) return;
      const dias = Math.floor((new Date().getTime() - new Date(o.ORC_DATA_EMISSAO_ORCAMENTO).getTime()) / (1000 * 60 * 60 * 24));
      const bucket = raw.find(b => dias <= b.maxD) || raw[3];
      bucket.valor += (o.ORC_VALOR_TOTAL || 0);
    });
    return raw;
  }, [orcAbertos]);

  // Churn por faixa
  const churnData = useMemo(() => {
    const raw = [
      { name: 'Ativos', min: 0, max: 90, quantidade: 0 },
      { name: '90-180d', min: 91, max: 180, quantidade: 0 },
      { name: '6m-1ano', min: 181, max: 365, quantidade: 0 },
      { name: '1-2 anos', min: 366, max: 730, quantidade: 0 },
      { name: '> 2 anos', min: 731, max: 99999, quantidade: 0 },
    ];
    clientesFiltrados.forEach((c: any) => {
      if (c.DIAS_SEM_COMPRA == null) return;
      const bucket = raw.find(b => c.DIAS_SEM_COMPRA >= b.min && c.DIAS_SEM_COMPRA <= b.max) || raw[4];
      bucket.quantidade += 1;
    });
    return raw;
  }, [clientesFiltrados]);

  // Cross-sell: usa o período global como janela em vez do antigo hardcoded 90 dias
  const periodoCrossDias = fPeriodoDias > 0 ? fPeriodoDias : 90;
  const maquinasRecentesTotal = useMemo(() => maquinasFiltradas.map((m: any) => {
    let diasAge = 9999;
    if (m.EMISSAO) {
      const dt = new Date(m.EMISSAO.toString().includes('Date') ? parseInt(m.EMISSAO.match(/\d+/)![0]) : m.EMISSAO);
      if (!isNaN(dt.getTime())) diasAge = Math.floor((new Date().getTime() - dt.getTime()) / (1000 * 60 * 60 * 24));
    }
    return { ...m, diasAposFaturamento: diasAge };
  }).filter((m: any) => m.diasAposFaturamento <= periodoCrossDias).sort((a: any, b: any) => a.diasAposFaturamento - b.diasAposFaturamento), [maquinasFiltradas, periodoCrossDias]);

  const crossFiliasDisponiveis = useMemo(() => Array.from(new Set(maquinasRecentesTotal.map((m: any) => String(m.FILIAL || '')).filter(Boolean))), [maquinasRecentesTotal]);
  const crossFabricantesDisponiveis = useMemo(() => Array.from(new Set(maquinasRecentesTotal.map((m: any) => String(m.FABRICANTE || m.marca || '').trim()).filter(Boolean))), [maquinasRecentesTotal]);
  const crossModelosDisponiveis = useMemo(() => Array.from(new Set(maquinasRecentesTotal.map((m: any) => String(m.MODELO || '').trim()).filter(Boolean))), [maquinasRecentesTotal]);
  const crossVendedoresDisponiveis = useMemo(() => Array.from(new Set(maquinasRecentesTotal.map((m: any) => String(m.NOME_VENDEDOR || '').trim()).filter(Boolean))).sort(), [maquinasRecentesTotal]);

  const maquinasRecentesFiltradas = useMemo(() => maquinasRecentesTotal.filter((m: any) => {
    if (crossFilial && String(m.FILIAL) !== crossFilial) return false;
    if (crossFabricante && String(m.FABRICANTE || m.marca || '').trim() !== crossFabricante) return false;
    if (crossModelo && String(m.MODELO || '').trim() !== crossModelo) return false;
    if (crossVendedor && String(m.NOME_VENDEDOR || '').trim() !== crossVendedor) return false;
    return true;
  }), [maquinasRecentesTotal, crossFilial, crossFabricante, crossModelo, crossVendedor]);

  // Índice de máquinas por cliente para a lista de reativação
  const maquinasPorCliente = useMemo(() => {
    const idx = new Map<string, any[]>();
    for (const m of maquinas) {
      const key = `${m.COD_CLIENTE || m.CODIGO_CLIENTE}_${m.LOJA_CLIENTE}`;
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key)!.push(m);
    }
    return idx;
  }, [maquinas]);

  const semDados = clientes.length === 0 && orcamentos.length === 0 && maquinas.length === 0;
  const filtroAtivo = !!(fVendedor || fFilial || fPeriodoDias !== 90);

  function limparFiltros() {
    setFVendedor('');
    setFFilial('');
    setFPeriodoDias(90);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <Loader2 size={48} className="text-sky-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-lg">Carregando dados do CRM...</p>
        </div>
      </div>
    );
  }

  if (semDados) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center glass-panel p-12 max-w-lg">
          <Database size={64} className="text-sky-400/50 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-3">Aguardando Sincronização</h2>
          <p className="text-gray-400 mb-6">
            O banco de dados está vazio. A próxima carga automática do ERP Protheus será executada em breve pelo Task Scheduler.
          </p>
          <div className="flex items-center justify-center gap-2 text-sky-400 text-sm">
            <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            Ouvindo sincronizações em <code className="bg-white/5 px-2 py-0.5 rounded">crnm-pecas.vercel.app/api/sync</code>
          </div>
        </div>
      </div>
    );
  }

  const periodoLabel = PERIODOS.find(p => p.dias === fPeriodoDias)?.label || `${fPeriodoDias}d`;
  const subPeriodoTxt = fPeriodoDias === 0 ? 'todo período' : `últimos ${periodoLabel}`;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* HEADER */}
      <header className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white mb-2">Visão Geral</h1>
          <p className="text-gray-400">Aqui está o pulso das suas vendas preditivas hoje.</p>
        </div>
        <div className="flex gap-4">
          <div className="glass-panel px-4 py-2 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <div>
              <span className="text-sm font-medium text-emerald-100">Dados Reais — Supabase</span>
              {ultimaSync && <p className="text-[10px] text-gray-500">Última sync: {ultimaSync}</p>}
            </div>
          </div>
        </div>
      </header>

      {/* BARRA DE FILTROS GLOBAIS */}
      <div className={`glass-panel p-3 flex flex-wrap items-center gap-3 border ${filtroAtivo ? 'border-sky-500/30 bg-sky-500/[0.02]' : 'border-white/5'}`}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400 pr-2 border-r border-white/10">
          <Filter size={14} className={filtroAtivo ? 'text-sky-400' : 'text-gray-500'} />
          Filtros
        </div>
        <select
          className="bg-black/30 border border-white/10 text-sm rounded px-3 py-1.5 text-gray-200 focus:outline-none focus:border-sky-500 min-w-[200px]"
          value={fVendedor}
          onChange={e => setFVendedor(e.target.value)}
        >
          <option value="">Todos os vendedores</option>
          {vendedoresDisponiveis.map(v => <option key={v.codigo} value={v.codigo}>{v.nome}</option>)}
        </select>
        <select
          className="bg-black/30 border border-white/10 text-sm rounded px-3 py-1.5 text-gray-200 focus:outline-none focus:border-sky-500"
          value={fFilial}
          onChange={e => setFFilial(e.target.value)}
        >
          <option value="">Todas as lojas</option>
          {filiaisDisponiveis.map(f => <option key={f} value={f}>Loja {f}</option>)}
        </select>
        <select
          className="bg-black/30 border border-white/10 text-sm rounded px-3 py-1.5 text-gray-200 focus:outline-none focus:border-sky-500"
          value={fPeriodoDias}
          onChange={e => setFPeriodoDias(Number(e.target.value))}
        >
          {PERIODOS.map(p => <option key={p.dias} value={p.dias}>{p.label}</option>)}
        </select>
        {filtroAtivo && (
          <button onClick={limparFiltros} className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 px-2 py-1.5 transition-colors ml-auto">
            <RotateCcw size={12} /> Limpar filtros
          </button>
        )}
      </div>

      {/* CARDS DE OPERAÇÃO */}
      {(() => {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const acoesAtivas = acoesFiltradas.filter((a: any) => ['PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA'].includes(a.status));
        const acoesVencidas = acoesAtivas.filter((a: any) => {
          if (!a.data_vencimento) return false;
          return new Date(a.data_vencimento + 'T00:00:00') < hoje;
        });
        const acoesHoje = acoesAtivas.filter((a: any) => {
          if (!a.data_vencimento) return false;
          const venc = new Date(a.data_vencimento + 'T00:00:00');
          return venc.getTime() === hoje.getTime();
        });
        const acoesUrgentes = [...acoesVencidas, ...acoesHoje, ...acoesAtivas.filter((a: any) => a.prioridade === 'URGENTE' && !acoesVencidas.includes(a) && !acoesHoje.includes(a))].slice(0, 5);
        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-5">
              <KpiCard
                title="Total de Clientes"
                value={clientesFiltrados.length.toString()}
                subtitle={`${totalAtivos} ativos • ${clientesFiltrados.length - totalAtivos} bloqueados`}
                icon={<Users className="text-sky-400" />}
                accentColor="sky"
                tooltip="Quantidade total de clientes na base, respeitando os filtros aplicados (vendedor/filial). 'Ativos' são clientes com STATUS_BASE = A no Protheus; 'Bloqueados' têm qualquer outro valor."
              />
              <KpiCard
                title="Risco de Evasão (Churn)"
                value={clientesEmRisco.length.toString()}
                subtitle="Clientes há >90 dias sem compra"
                icon={<AlertCircle className="text-red-400" />}
                accentColor="red"
                tooltip="Clientes com mais de 90 dias sem nenhuma compra registrada (campo DIAS_SEM_COMPRA do Protheus). São candidatos a ações de reativação."
              />
              <KpiCard
                title="Oportunidades Cross-Sell"
                value={maquinasRecentesTotal.length.toString()}
                subtitle={`Equipamentos vendidos nos ${subPeriodoTxt}`}
                icon={<Tractor className="text-amber-400" />}
                accentColor="amber"
                href={`/maquinas?recentes=${periodoCrossDias}`}
                tooltip={`Máquinas vendidas dentro do período selecionado (${subPeriodoTxt}). Cada equipamento novo é uma oportunidade aberta para venda de peças e consumíveis.`}
              />
              <KpiCard
                title="Orçamentos Abertos"
                value={`R$ ${totalAbertos.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}
                subtitle={`${orcAbertosUnicos} orçamentos • ${orcAbertos.length} itens`}
                icon={<ReceiptText className="text-blue-400" />}
                accentColor="sky"
                href="/orcamentos"
                tooltip="Soma do valor (R$) dos itens de orçamentos com STATUS = ABERTO no ERP. Pipeline ativo — ainda não foi faturado, cancelado ou venceu."
              />
              <KpiCard
                title="Ações Pendentes"
                value={acoesAtivas.length.toString()}
                subtitle={`${acoesVencidas.length} vencidas • ${acoesHoje.length} para hoje`}
                icon={<Zap className="text-violet-400" />}
                accentColor="violet"
                href="/acoes"
                tooltip="Ações comerciais com status PENDENTE, EM_ANDAMENTO ou REAGENDADA. 'Vencidas' têm data de vencimento anterior a hoje; 'para hoje' vencem na data de hoje."
              />
              <KpiCard
                title="Vencidos · últimos 30 dias"
                value={orcVencidos30d.length.toString()}
                subtitle={`R$ ${totalVencidos30d.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0})} para recuperar`}
                icon={<Hourglass className="text-amber-400" />}
                accentColor="amber"
                href="/orcamentos?status=VENCIDO&periodoVenc=30"
                tooltip="Orçamentos com STATUS = VENCIDO cuja data de validade (ORC_DATA_ORCAMENTO) caiu nos últimos 30 dias. Janela de recuperação — em vez de estender +7d manualmente, contate o cliente e retome a oferta."
              />
            </div>

            {/* TAXAS DE CONVERSÃO */}
            <div className="flex items-center gap-3 pt-2 pb-1">
              <Award size={16} className="text-emerald-400" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-300">Taxas de Conversão</h2>
              <span className="text-xs text-gray-500">— orçamentos fechados ({subPeriodoTxt})</span>
              <div className="flex-1 border-t border-white/5 ml-2" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
              <KpiCard
                title="Win Rate (Qtd)"
                value={`${winRateQtd.toFixed(1)}%`}
                subtitle={`${orcFaturados.length} ganhos de ${fechadosQtd} fechados`}
                icon={<TrendingUp className="text-emerald-400" />}
                accentColor="emerald"
                tooltip="% de orçamentos faturados sobre o total fechado, por contagem. Fórmula: FATURADO / (FATURADO + CANCELADO + VENCIDO). VENCIDO conta como perda (orçamento que expirou sem fechar)."
              />
              <KpiCard
                title="Win Rate (R$)"
                value={`${winRateValor.toFixed(1)}%`}
                subtitle={`R$ ${(totalFaturado/1000).toFixed(0)}k de R$ ${(fechadosValor/1000).toFixed(0)}k`}
                icon={<TrendingUp className="text-emerald-400" />}
                accentColor="emerald"
                tooltip="% do valor (R$) faturado sobre o valor total fechado. Fórmula: Σ R$ FATURADO / Σ R$ (FATURADO + CANCELADO + VENCIDO). Pode divergir muito do Win Rate por Qtd quando há orçamentos com tickets muito diferentes."
              />
              <KpiCard
                title="Taxa de Perdidos"
                value={`${taxaCancelamento.toFixed(1)}%`}
                subtitle={`${orcCancelados.length} perdidos`}
                icon={<X className="text-red-400" />}
                accentColor="red"
                tooltip="% de orçamentos perdidos (CANCELADO no ERP) sobre o total fechado. Fórmula: CANCELADO / (FATURADO + CANCELADO + VENCIDO). Indica perdas ativas (cliente desistiu/recusou)."
              />
              <KpiCard
                title="Taxa de Vencimento"
                value={`${taxaVencimento.toFixed(1)}%`}
                subtitle={`${orcVencidos.length} orçamentos expiraram`}
                icon={<Hourglass className="text-amber-400" />}
                accentColor="amber"
                tooltip="% de orçamentos que expiraram sem fechamento. Fórmula: VENCIDO / (FATURADO + CANCELADO + VENCIDO). Geralmente indica falha de follow-up — proposta enviada e nunca retomada."
              />
              <KpiCard
                title="R$ Deixado na Mesa"
                value={`R$ ${totalVencido.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}
                subtitle="Volume em orçamentos vencidos"
                icon={<AlertTriangle className="text-amber-400" />}
                accentColor="amber"
                tooltip="Soma do valor (R$) de todos os orçamentos com STATUS = VENCIDO no período filtrado. Volume teoricamente recuperável com follow-up melhor."
              />
            </div>

            {/* AÇÕES URGENTES DE HOJE */}
            {acoesUrgentes.length > 0 && (
              <div className="glass-panel p-5 border border-violet-500/20 bg-violet-950/10 shadow-[0_0_30px_rgba(139,92,246,0.05)]">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Zap size={18} className="text-violet-400" />
                    Ações Prioritárias
                    {acoesVencidas.length > 0 && (
                      <span className="text-xs font-black bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full border border-red-500/20 animate-pulse">
                        {acoesVencidas.length} atrasada{acoesVencidas.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </h2>
                  <Link href="/acoes" className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
                    Ver todas <ChevronRight size={14} />
                  </Link>
                </div>
                <div className="space-y-2">
                  {acoesUrgentes.map((a: any) => (
                    <AcaoCard
                      key={a.id}
                      acao={a}
                      compact
                      onConcluir={() => setConcluirAcao(a)}
                      onClickCliente={a.codigo_cliente ? (cod, loja) => setClienteModal({codigo: cod, loja}) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">

        {/* CROSS-SELL RECENTE */}
        <div className="lg:col-span-2 glass-panel p-6 flex flex-col border border-amber-500/20 bg-amber-950/10 shadow-[0_0_30px_rgba(245,158,11,0.05)]">
          <div className="flex flex-col mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Tractor size={18} className="text-amber-400" />
                Máquinas vendidas recentemente
              </h2>
              <Link href="/maquinas" className="text-sm text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors">
                Trabalhar Leads <ChevronRight size={14} />
              </Link>
            </div>

            <div className="flex flex-wrap gap-2">
              <select className="bg-black/30 border border-amber-500/20 text-xs rounded px-2 py-1.5 text-gray-300 focus:outline-none focus:border-amber-500" value={crossFilial} onChange={e => setCrossFilial(e.target.value)}>
                <option value="">Loja (Todas)</option>
                {crossFiliasDisponiveis.map((f:any) => <option key={f} value={f}>Loja {f}</option>)}
              </select>
              <select className="bg-black/30 border border-amber-500/20 text-xs rounded px-2 py-1.5 text-gray-300 focus:outline-none focus:border-amber-500" value={crossFabricante} onChange={e => setCrossFabricante(e.target.value)}>
                <option value="">Fabricante (Todos)</option>
                {crossFabricantesDisponiveis.map((f:any) => <option key={f} value={f}>{f}</option>)}
              </select>
              <select className="bg-black/30 border border-amber-500/20 text-xs rounded px-2 py-1.5 text-gray-300 focus:outline-none focus:border-amber-500" value={crossModelo} onChange={e => setCrossModelo(e.target.value)}>
                <option value="">Modelo (Todos)</option>
                {crossModelosDisponiveis.map((m:any) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select className="bg-black/30 border border-amber-500/20 text-xs rounded px-2 py-1.5 text-gray-300 focus:outline-none focus:border-amber-500" value={crossVendedor} onChange={e => setCrossVendedor(e.target.value)}>
                <option value="">Vendedor (Todos)</option>
                {crossVendedoresDisponiveis.map((v:any) => <option key={v} value={v}>{v}</option>)}
              </select>
              {(crossFilial || crossFabricante || crossModelo || crossVendedor) && (
                <button onClick={() => {setCrossFilial(''); setCrossFabricante(''); setCrossModelo(''); setCrossVendedor('');}} className="text-red-400 text-xs hover:text-red-300 flex items-center gap-1 px-2">
                  <X size={12}/> Limpar Filtro
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar pr-2">
            {maquinasRecentesFiltradas.slice(0, 20).map((m) => (
              <div key={m.id} onClick={() => setClienteModal({codigo: m.COD_CLIENTE || m.CODIGO_CLIENTE, loja: m.LOJA_CLIENTE})} className="group glass-panel !bg-amber-500/[0.02] hover:!bg-amber-500/[0.08] p-3.5 transition-all flex justify-between items-center cursor-pointer border border-transparent hover:border-amber-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                    <Tractor size={16} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-100 text-sm group-hover:text-white transition-colors">{m.NOME_CLIENTE || 'N/A'}</h3>
                    <p className="text-xs text-gray-500 flex flex-wrap items-center gap-2 mt-0.5">
                      <strong className="text-amber-200/80">{m.MODELO || 'N/A'}</strong>
                      <span>NF: {m.NOTA_FISCAL || '—'}</span>
                      <span className="opacity-50">| Vendedor Máq: {m.NOME_VENDEDOR || 'N/A'}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-emerald-400">
                    Faturado há {m.diasAposFaturamento} d
                  </div>
                  <div className="text-[10px] text-gray-500">{m.EMISSAO}</div>
                </div>
              </div>
            ))}
            {maquinasRecentesFiltradas.length === 0 && (
              <div className="text-sm text-gray-500 text-center py-8 bg-black/20 rounded-lg">
                Nenhuma entrega recente nos {subPeriodoTxt} com os filtros selecionados.
              </div>
            )}
          </div>
        </div>

        {/* RANKING DE VOLUME */}
        <div className="glass-panel p-6 flex flex-col lg:row-span-2">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Users size={18} className="text-amber-400" />
              Ranking de Vendedores
            </h2>
          </div>

          <div className="space-y-3 flex-1">
            {rankingVendedores.map((vend: any, i: number) => (
              <div
                key={i}
                onClick={() => setVendedorSelecionado(vend)}
                className="border-l-2 border-amber-400/50 py-2.5 relative group hover:bg-white/[0.02] transition-colors -ml-4 pl-8 rounded-r-lg cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-400/60 w-5">#{i+1}</span>
                    <div className="text-sm font-semibold text-gray-200 uppercase truncate max-w-[140px]" title={vend.nome}>{vend.nome}</div>
                  </div>
                  <div className="text-sm font-bold text-white">
                    R$ {vend.total.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                  </div>
                </div>
                <div className="text-xs text-amber-300/70 mt-1 ml-7">
                  {vend.quantidade} orçamento(s) no período
                </div>
              </div>
            ))}
            {rankingVendedores.length === 0 && (
              <div className="text-sm text-gray-500 text-center py-6">Nenhum orçamento no período/filtros.</div>
            )}
          </div>

          <Link href="/orcamentos" className="w-full mt-6 bg-white/5 hover:bg-white/10 text-gray-300 transition-colors py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
            Ver Todos os Orçamentos <ChevronRight size={14} />
          </Link>
        </div>

        {/* CLIENTES PARA REATIVAR */}
        <div className="lg:col-span-2 glass-panel p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <TrendingUp size={18} className="text-sky-400" />
              Resgate Imediato — Clientes para Reativar
            </h2>
            <Link href="/clientes" className="text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors">
              Ver todos <ChevronRight size={14} />
            </Link>
          </div>

          <div className="space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar pr-2">
            {clientesFiltrados.filter(c => (c.DIAS_SEM_COMPRA || 0) > 0 && c.STATUS_BASE !== 'BLOQUEADO' && (c.DIAS_SEM_COMPRA || 0) < 365).sort((a,b) => (b.DIAS_SEM_COMPRA || 0) - (a.DIAS_SEM_COMPRA || 0)).slice(0, 12).map((c) => {
              const maqs = maquinasPorCliente.get(`${c.CODIGO_CLIENTE}_${c.LOJA_CLIENTE}`) || [];
              const ultimasMaquinas = maqs.sort((a: any, b: any) => new Date(b.EMISSAO || 0).getTime() - new Date(a.EMISSAO || 0).getTime()).slice(0, 1);
              return (
                <div key={c.id} onClick={() => setClienteModal({codigo: c.CODIGO_CLIENTE, loja: c.LOJA_CLIENTE})} className="group glass-panel !bg-white/[0.02] hover:!bg-white/[0.05] p-3.5 transition-all flex justify-between items-center cursor-pointer border border-transparent hover:border-white/10">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${(c.DIAS_SEM_COMPRA || 0) > 90 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : (c.DIAS_SEM_COMPRA || 0) > 30 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                      {(c.NOME_CLIENTE || '??').substring(0,2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-100 text-sm group-hover:text-white transition-colors">{c.NOME_CLIENTE}</h3>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <MapPin size={10} /> {c.CIDADE}-{c.UF}
                        {c.STATUS_BASE === 'BLOQUEADO' && <span className="ml-2 text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">BLOQUEADO</span>}
                      </p>
                      {ultimasMaquinas.length > 0 && (
                        <p className="text-[10px] text-gray-400/70 mt-1 flex flex-wrap gap-1 items-center">
                          <Tractor size={10} className="text-amber-500/50" />
                          <span>{ultimasMaquinas[0].FABRICANTE || ultimasMaquinas[0].marca || 'MÁQ'} {ultimasMaquinas[0].MODELO} ({ultimasMaquinas[0].EMISSAO || 's/d'})</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${(c.DIAS_SEM_COMPRA || 0) > 90 ? 'text-red-400' : (c.DIAS_SEM_COMPRA || 0) > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {c.DIAS_SEM_COMPRA || 0} dias
                    </div>
                    <div className="text-[10px] text-gray-500">sem comprar</div>
                  </div>
                </div>
              )})}
            {clientesFiltrados.filter(c => (c.DIAS_SEM_COMPRA || 0) > 0 && c.STATUS_BASE !== 'BLOQUEADO' && (c.DIAS_SEM_COMPRA || 0) < 365).length === 0 && (
              <div className="text-sm text-gray-500 text-center py-6">Nenhum cliente em risco iminente encontrado.</div>
            )}
          </div>
        </div>

      </div>

      {/* RANKING DE EFICÁCIA POR VENDEDOR */}
      <div className="glass-panel p-6 border border-emerald-500/20 bg-emerald-950/5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Award size={18} className="text-emerald-400" />
            Ranking de Eficácia — Win Rate por Vendedor
          </h2>
          <span className="text-xs text-gray-500">Mínimo 3 orçamentos fechados • {subPeriodoTxt}</span>
        </div>
        {rankingEficacia.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-8">
            Ninguém com 3+ orçamentos fechados no período/filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase text-gray-500 tracking-wider">
                <tr className="border-b border-white/5">
                  <th className="py-2 font-semibold">#</th>
                  <th className="py-2 font-semibold">Vendedor</th>
                  <th className="py-2 text-center font-semibold">Fechados</th>
                  <th className="py-2 text-center font-semibold text-emerald-400">Ganhos</th>
                  <th className="py-2 text-center font-semibold text-red-400">Perdidos</th>
                  <th className="py-2 text-center font-semibold text-amber-400">Vencidos</th>
                  <th className="py-2 text-right font-semibold">Win Rate (Qtd)</th>
                  <th className="py-2 text-right font-semibold">Win Rate (R$)</th>
                  <th className="py-2 text-right font-semibold">R$ Ganho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rankingEficacia.map((r: any, i: number) => (
                  <tr key={r.nome} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 text-amber-400/60 font-bold">#{i+1}</td>
                    <td className="py-3 font-semibold text-gray-200 uppercase">{r.nome}</td>
                    <td className="py-3 text-center text-gray-300">{r.totalFechados}</td>
                    <td className="py-3 text-center text-emerald-400">{r.faturados}</td>
                    <td className="py-3 text-center text-red-400/80">{r.cancelados}</td>
                    <td className="py-3 text-center text-amber-400/80">{r.vencidos}</td>
                    <td className="py-3 text-right">
                      <span className={`font-bold ${r.winRateQtd >= 60 ? 'text-emerald-400' : r.winRateQtd >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                        {r.winRateQtd.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span className={`font-bold ${r.winRateValor >= 60 ? 'text-emerald-400' : r.winRateValor >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                        {r.winRateValor.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 text-right text-emerald-300 font-semibold">
                      R$ {r.valorFat.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* GRÁFICOS */}
      <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
        {/* Funil de Orçamentos abertos */}
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
            <ReceiptText size={18} className="text-emerald-400" />
            Funil Preditivo — Orçamentos (Tempo)
          </h2>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funilOrcamentos} layout="vertical" margin={{ top: 0, right: 60, left: 40, bottom: 0 }}>
                <XAxis type="number" stroke="#4b5563" tickFormatter={(val) => `R$ ${(val/1000).toFixed(0)}k`} />
                <YAxis dataKey="name" type="category" stroke="#9ca3af" width={90} />
                <Tooltip
                  cursor={{fill: 'rgba(255,255,255,0.02)'}}
                  contentStyle={{ backgroundColor: '#0b101a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  formatter={(value: any) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Volume Retido']}
                />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                  {funilOrcamentos.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                  <LabelList
                    dataKey="valor"
                    position="right"
                    fill="#9ca3af"
                    fontSize={11}
                    formatter={(val: any) => `R$ ${(Number(val)/1000).toFixed(1)}k`}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Conversão e Performance */}
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
            <TrendingUp size={18} className="text-emerald-400" />
            Conversão e Performance
          </h2>
          <div className="flex flex-col justify-center gap-6 h-[250px] w-full">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Total Ganho</p>
                <h3 className="text-2xl font-bold text-emerald-400">R$ {totalFaturado.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</h3>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-full">
                <TrendingUp size={24} className="text-emerald-400" />
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Total Perdido + Vencido</p>
                <h3 className="text-2xl font-bold text-red-400">R$ {(totalCancelado + totalVencido).toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</h3>
              </div>
              <div className="p-3 bg-red-500/10 rounded-full">
                <TrendingUp size={24} className="text-red-400 rotate-180" />
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Ticket Médio (Ganhos)</p>
                <h3 className="text-2xl font-bold text-sky-400">R$ {orcFaturados.length > 0 ? (totalFaturado / orcFaturados.length).toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0}) : '0'}</h3>
              </div>
              <div className="p-3 bg-sky-500/10 rounded-full">
                <ReceiptText size={24} className="text-sky-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Churn */}
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
            <AlertCircle size={18} className="text-red-400" />
            Análise de Risco — Inatividade (Dias)
          </h2>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={churnData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorChurn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#4b5563" />
                <YAxis stroke="#4b5563" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0b101a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  formatter={(value: any) => [`${value} Clientes`, 'Volume Escapando']}
                />
                <Area type="monotone" dataKey="quantidade" stroke="#ef4444" fillOpacity={1} fill="url(#colorChurn)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>


      {/* MODAL DE ORÇAMENTOS DO VENDEDOR */}
      {vendedorSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/10 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">

            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
              <div>
                <h2 className="text-xl font-bold text-white uppercase">{vendedorSelecionado.nome}</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {vendedorSelecionado.quantidade} Orçamentos — Total: <span className="text-amber-400 font-semibold">R$ {vendedorSelecionado.total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </p>
              </div>
              <button onClick={() => setVendedorSelecionado(null)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-0 overflow-y-auto flex-1">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="text-xs uppercase bg-white/[0.03] text-gray-400 sticky top-0 backdrop-blur-md z-10">
                  <tr>
                    <th className="px-6 py-4 font-semibold border-b border-white/5">Cliente</th>
                    <th className="px-6 py-4 font-semibold border-b border-white/5">Produto</th>
                    <th className="px-6 py-4 font-semibold border-b border-white/5">Emissão</th>
                    <th className="px-6 py-4 text-right font-semibold border-b border-white/5">Valor Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {vendedorSelecionado.orcamentos.map((o: any, idx: number) => (
                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-3">
                        <div className="font-medium text-white">{o.CLIENTE_ORC || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="text-gray-200 font-mono text-xs">{o.CODIGO_PRODUTO_ORC}</div>
                        <div className="text-gray-500 text-xs mt-0.5">Orç #{o.ORC_NUMERO_ORCAMENTO}</div>
                      </td>
                      <td className="px-6 py-3 text-gray-400 text-xs">
                        {o.ORC_DATA_EMISSAO_ORCAMENTO ? (
                          o.ORC_DATA_EMISSAO_ORCAMENTO.includes('/Date(')
                            ? new Date(parseInt(o.ORC_DATA_EMISSAO_ORCAMENTO.match(/\\d+/)?.[0] || '0')).toLocaleDateString('pt-BR')
                            : new Date(o.ORC_DATA_EMISSAO_ORCAMENTO).toLocaleDateString('pt-BR')
                        ) : '—'}
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-amber-200">
                        R$ {(o.ORC_VALOR_TOTAL || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-white/10 bg-white/[0.01] flex justify-end">
              <button onClick={() => setVendedorSelecionado(null)} className="px-6 py-2 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors border border-white/5">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CLIENTE 360 */}
      {clienteModal && (
        <Cliente360Modal
          codigoCliente={clienteModal.codigo}
          lojaCliente={clienteModal.loja}
          onClose={() => setClienteModal(null)}
        />
      )}

      {/* MODAL CONCLUIR AÇÃO */}
      {concluirAcao && (
        <ConcluirAcaoModal
          acao={concluirAcao}
          onClose={() => setConcluirAcao(null)}
          onSave={refreshAcoes}
        />
      )}

    </div>
  );
}

function KpiCard({ title, value, subtitle, icon, accentColor, href, tooltip }: any) {
  const [showTip, setShowTip] = useState(false);
  const colors: Record<string, { bg: string, glow: string }> = {
    red: { bg: 'bg-red-500/10', glow: 'bg-red-500/50' },
    sky: { bg: 'bg-sky-500/10', glow: 'bg-sky-500/50' },
    emerald: { bg: 'bg-emerald-500/10', glow: 'bg-emerald-500/50' },
    amber: { bg: 'bg-amber-500/10', glow: 'bg-amber-500/50' },
    violet: { bg: 'bg-violet-500/10', glow: 'bg-violet-500/50' },
  };
  const accent = colors[accentColor] || colors.sky;

  const CardInner = (
    <div className={`glass-panel p-5 flex flex-col relative overflow-hidden group h-full ${href ? 'cursor-pointer hover:bg-white/[0.02]' : ''}`}>
      <div className={`absolute top-0 left-0 w-full h-1 ${accent.glow} opacity-0 group-hover:opacity-100 transition-opacity`} />
      <div className="flex justify-between items-start mb-3 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3 className="text-gray-400 font-medium text-xs uppercase tracking-wide">{title}</h3>
          {tooltip && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
              onFocus={() => setShowTip(true)}
              onBlur={() => setShowTip(false)}
              className="inline-flex items-center justify-center w-4 h-4 rounded-full text-gray-500 hover:text-gray-200 hover:bg-white/10 transition-colors cursor-help shrink-0"
              aria-label="Como este KPI é calculado"
            >
              <Info size={11} />
            </button>
          )}
        </div>
        <div className={`p-2 rounded-lg ${accent.bg} shrink-0`}>{icon}</div>
      </div>
      <div className="text-2xl font-bold text-white mb-1 group-hover:scale-[1.02] origin-left transition-transform">{value}</div>
      <p className="text-[11px] text-gray-500 mt-auto">{subtitle}</p>
    </div>
  );

  return (
    <div className="relative h-full">
      {href ? <Link href={href} className="block h-full">{CardInner}</Link> : CardInner}
      {tooltip && showTip && (
        <div className="absolute left-3 right-3 top-11 p-3 rounded-lg bg-gray-950/95 border border-white/10 shadow-2xl text-[11px] text-gray-300 leading-snug z-50 pointer-events-none backdrop-blur-sm">
          {tooltip}
        </div>
      )}
    </div>
  );
}
