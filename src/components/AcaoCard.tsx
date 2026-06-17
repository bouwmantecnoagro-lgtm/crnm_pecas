'use client';

import { Phone, MessageCircle, Mail, MapPin, FileText, Package, HelpCircle, CheckCircle2, Clock, AlertTriangle, XCircle, RotateCcw, Edit2 } from 'lucide-react';
import { getCategoriaAcao } from '@/lib/acao';

const TIPO_ICONS: Record<string, React.ReactNode> = {
  LIGAR: <Phone size={14} />,
  WHATSAPP: <MessageCircle size={14} />,
  EMAIL: <Mail size={14} />,
  VISITA: <MapPin size={14} />,
  FOLLOW_UP_ORCAMENTO: <FileText size={14} />,
  OFERTA_PECAS: <Package size={14} />,
  OUTRO: <HelpCircle size={14} />,
};

const TIPO_COLORS: Record<string, string> = {
  LIGAR: 'text-emerald-400',
  WHATSAPP: 'text-green-400',
  EMAIL: 'text-blue-400',
  VISITA: 'text-purple-400',
  FOLLOW_UP_ORCAMENTO: 'text-amber-400',
  OFERTA_PECAS: 'text-orange-400',
  OUTRO: 'text-gray-400',
};

const PRIORIDADE_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  URGENTE: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500 animate-pulse' },
  ALTA: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-500' },
  MEDIA: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-500' },
  BAIXA: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-500' },
};

const STATUS_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  PENDENTE: { icon: <Clock size={12} />, color: 'text-amber-400' },
  EM_ANDAMENTO: { icon: <RotateCcw size={12} />, color: 'text-sky-400' },
  CONCLUIDA: { icon: <CheckCircle2 size={12} />, color: 'text-emerald-400' },
  CANCELADA: { icon: <XCircle size={12} />, color: 'text-red-400' },
  REAGENDADA: { icon: <RotateCcw size={12} />, color: 'text-purple-400' },
};

interface AcaoCardProps {
  acao: any;
  onConcluir?: () => void;
  onEdit?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onClickCliente?: (codigo: string, loja: string) => void;
  compact?: boolean;
}

export default function AcaoCard({ acao, onConcluir, onEdit, onDragStart, onClickCliente, compact = false }: AcaoCardProps) {
  const prio = PRIORIDADE_STYLES[acao.prioridade] || PRIORIDADE_STYLES.MEDIA;
  const statusInfo = STATUS_ICONS[acao.status] || STATUS_ICONS.PENDENTE;
  const tipoIcon = TIPO_ICONS[acao.tipo] || TIPO_ICONS.OUTRO;
  const tipoColor = TIPO_COLORS[acao.tipo] || TIPO_COLORS.OUTRO;
  const cat = getCategoriaAcao(acao);

  // Calcular se está vencida
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const vencimento = acao.data_vencimento ? new Date(acao.data_vencimento + 'T00:00:00') : null;
  const vencida = vencimento && vencimento < hoje && acao.status !== 'CONCLUIDA' && acao.status !== 'CANCELADA';
  const venceHoje = vencimento && vencimento.getTime() === hoje.getTime();

  const formatarData = (d: string) => {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  if (compact) {
    return (
      <div className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-pointer hover:bg-white/[0.03] ${
        vencida ? 'border-red-500/30 bg-red-500/[0.03]' : 'border-white/5 bg-white/[0.01]'
      }`} onClick={onConcluir}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${prio.dot}`} />
        <span className={`shrink-0 ${tipoColor}`}>{tipoIcon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-200 truncate">{acao.titulo}</p>
          <p 
            className={`text-[10px] truncate transition-colors ${acao.codigo_cliente && onClickCliente ? 'text-sky-400 hover:text-sky-300 font-medium cursor-pointer underline decoration-sky-500/30' : 'text-gray-500'}`}
            onClick={acao.codigo_cliente && onClickCliente ? (e) => { e.stopPropagation(); onClickCliente(acao.codigo_cliente, acao.loja_cliente); } : undefined}
            onMouseDown={acao.codigo_cliente && onClickCliente ? (e) => e.stopPropagation() : undefined}
            title={acao.codigo_cliente && onClickCliente ? "Ver detalhes do cliente" : ""}
          >
            {acao.nome_cliente || 'S/ cliente'}{acao.numero_orcamento ? ` · Orç #${acao.numero_orcamento}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-[10px] font-bold ${vencida ? 'text-red-400' : venceHoje ? 'text-amber-400' : 'text-gray-500'}`}>
            {vencida ? '⚠️ Atrasada' : venceHoje ? 'Hoje' : formatarData(acao.data_vencimento)}
          </p>
        </div>
        {onConcluir && acao.status !== 'CONCLUIDA' && acao.status !== 'CANCELADA' && (
          <button
            onClick={e => { e.stopPropagation(); onConcluir(); }}
            className="opacity-0 group-hover:opacity-100 px-2 py-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded transition-all hover:bg-emerald-500/20 shrink-0"
          >
            ✓
          </button>
        )}
      </div>
    );
  }

  return (
    <div 
      className={`glass-panel p-4 transition-all hover:border-white/20 group relative overflow-hidden ${
        onDragStart ? 'cursor-default active:cursor-grabbing' : ''
      } ${vencida ? 'border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.05)]' : ''}`}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
    >
      {/* Indicador lateral de prioridade */}
      <div className={`absolute top-0 left-0 w-1 h-full ${prio.bg.replace('/10', '/40')} rounded-l-2xl`} />

      {/* Top row: prioridade + tipo + vencimento */}
      <div className="flex items-center justify-between mb-2 pl-2">
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase ${prio.bg} ${prio.text} border border-current/20`}>
            <span className={`w-1.5 h-1.5 rounded-full ${prio.dot}`} />
            {acao.prioridade}
          </span>
          <span className={`flex items-center gap-1 text-[10px] font-medium ${tipoColor}`}>
            {tipoIcon} {acao.tipo?.replace(/_/g, ' ')}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${cat.chip}`}>
            {cat.label}
          </span>
        </div>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-sm ${
          vencida ? 'bg-red-500/20 text-red-400' : venceHoje ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-400'
        }`}>
          {vencida ? '⚠️ Atrasada' : venceHoje ? '📌 Hoje' : formatarData(acao.data_vencimento)}
        </span>
      </div>

      {/* Cliente */}
      <h4 
        onClick={acao.codigo_cliente && onClickCliente ? (e) => { e.stopPropagation(); onClickCliente(acao.codigo_cliente, acao.loja_cliente); } : undefined}
        onMouseDown={acao.codigo_cliente && onClickCliente ? (e) => e.stopPropagation() : undefined}
        className={`font-semibold text-sm leading-tight mb-1 pl-2 transition-colors ${acao.codigo_cliente && onClickCliente ? 'text-sky-400 hover:text-sky-300 cursor-pointer underline decoration-sky-500/30 relative z-10' : 'text-gray-100 group-hover:text-white'}`}
        title={acao.codigo_cliente && onClickCliente ? "Ver detalhes do cliente" : ""}
      >
        {acao.nome_cliente || 'Sem Cliente'}
      </h4>

      {/* Título da ação */}
      <p className="text-xs text-gray-400 pl-2 mb-2 line-clamp-2">{acao.titulo}</p>

      {/* Orçamento que originou a ação */}
      {acao.numero_orcamento && (
        <div className="pl-2 mb-3">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500/10 text-amber-300/90 border border-amber-500/20 px-2 py-0.5 rounded">
            <FileText size={9} /> Orç #{acao.numero_orcamento}
          </span>
        </div>
      )}

      {/* Descrição se tiver */}
      {acao.descricao && (
        <div className="pl-2 mb-3">
          <p className="text-[11px] text-gray-500 italic line-clamp-2 bg-white/[0.02] px-2 py-1.5 rounded border border-white/5">
            "{acao.descricao}"
          </p>
        </div>
      )}

      {/* Resultado (se concluída) */}
      {acao.resultado && (
        <div className="pl-2 mb-3">
          {acao.resultado === 'REAGENDAR' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              🔄 Reagendada p/ {formatarData(acao.data_vencimento)}
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
              acao.resultado === 'VENDA_REALIZADA' ? 'bg-sky-500/20 text-sky-400' :
              acao.resultado === 'CLIENTE_INTERESSADO' ? 'bg-emerald-500/20 text-emerald-400' :
              acao.resultado === 'SEM_INTERESSE' ? 'bg-red-500/20 text-red-400' :
              'bg-gray-500/20 text-gray-400'
            }`}>
              {acao.resultado.replace(/_/g, ' ')}
            </span>
          )}
          {acao.observacoes && (
            <p className="text-[10px] text-gray-500 mt-1 italic">"{acao.observacoes}"</p>
          )}
        </div>
      )}

      {/* Footer: vendedor + ações */}
      <div className="pl-2 pt-3 border-t border-white/5 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 text-[10px] ${statusInfo.color}`}>
            {statusInfo.icon} {acao.status}
          </span>
          <span className="text-[10px] text-gray-600">•</span>
          <span className="text-[10px] text-gray-500 truncate max-w-[120px]">
            {acao.nome_vendedor?.split(' ')[0] || 'S/ vendedor'}
          </span>
        </div>
        <div className="flex gap-2">
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-1.5 text-gray-400 hover:text-white bg-white/5 border border-white/10 rounded-lg transition-all hover:bg-white/10"
              title="Editar Ação"
            >
              <Edit2 size={12} />
            </button>
          )}
          {onConcluir && acao.status !== 'CONCLUIDA' && acao.status !== 'CANCELADA' && (
            <button
              onClick={onConcluir}
              className="px-3 py-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg transition-all hover:bg-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/10"
            >
              ✓ Concluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
