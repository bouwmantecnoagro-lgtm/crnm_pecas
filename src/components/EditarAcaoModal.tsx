'use client';

import { useState } from 'react';
import { X, Edit2, Phone, MessageCircle, Mail, MapPin, FileText, Package, HelpCircle, Calendar, User, Activity, AlertTriangle } from 'lucide-react';

const TIPOS_ACAO = [
  { value: 'LIGAR', label: 'Ligar', icon: <Phone size={14} />, color: 'text-emerald-400' },
  { value: 'WHATSAPP', label: 'WhatsApp', icon: <MessageCircle size={14} />, color: 'text-green-400' },
  { value: 'EMAIL', label: 'E-mail', icon: <Mail size={14} />, color: 'text-blue-400' },
  { value: 'VISITA', label: 'Visita', icon: <MapPin size={14} />, color: 'text-purple-400' },
  { value: 'FOLLOW_UP_ORCAMENTO', label: 'Follow-up Orçamento', icon: <FileText size={14} />, color: 'text-amber-400' },
  { value: 'OFERTA_PECAS', label: 'Oferta de Peças', icon: <Package size={14} />, color: 'text-orange-400' },
  { value: 'OUTRO', label: 'Outro', icon: <HelpCircle size={14} />, color: 'text-gray-400' },
];

const PRIORIDADES = [
  { value: 'URGENTE', label: 'Urgente', color: 'bg-red-500/20 text-red-400 border-red-500/30', dot: 'bg-red-500' },
  { value: 'ALTA', label: 'Alta', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', dot: 'bg-orange-500' },
  { value: 'MEDIA', label: 'Média', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', dot: 'bg-amber-500' },
  { value: 'BAIXA', label: 'Baixa', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', dot: 'bg-gray-500' },
];

const STATUS = [
  { value: 'PENDENTE', label: 'Pendente', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'EM_ANDAMENTO', label: 'Em Andamento', color: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
  { value: 'CONCLUIDA', label: 'Concluída', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { value: 'CANCELADA', label: 'Cancelada', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
];

interface EditarAcaoModalProps {
  acao: any;
  vendedores: { codigo: string; nome: string }[];
  onClose: () => void;
  onSave: () => void;
}

export default function EditarAcaoModal({
  acao,
  vendedores,
  onClose,
  onSave,
}: EditarAcaoModalProps) {
  const [tipo, setTipo] = useState(acao.tipo || 'OUTRO');
  const [prioridade, setPrioridade] = useState(acao.prioridade || 'MEDIA');
  const [status, setStatus] = useState(acao.status === 'REAGENDADA' ? 'PENDENTE' : acao.status || 'PENDENTE');
  const [vendedorSel, setVendedorSel] = useState(acao.vendedor_responsavel || '');
  const [titulo, setTitulo] = useState(acao.titulo || '');
  const [descricao, setDescricao] = useState(acao.descricao || '');
  const [dataVencimento, setDataVencimento] = useState(acao.data_vencimento || '');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleSalvar = async () => {
    if (!titulo.trim()) return;
    setSaving(true);
    setErro(null);

    const vendedorObj = vendedores.find(v => v.codigo === vendedorSel);

    try {
      const res = await fetch(`/api/acoes/${acao.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          prioridade,
          status,
          vendedor_responsavel: vendedorSel || null,
          nome_vendedor: vendedorObj?.nome || null,
          data_vencimento: dataVencimento || null,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Não foi possível salvar as alterações. Tente novamente.');
      }
      onSave();
      onClose();
    } catch (err: any) {
      console.error('Erro ao editar ação:', err);
      setErro(err?.message || 'Não foi possível salvar as alterações. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-[#0b101a] border border-white/10 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
              <Edit2 size={20} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Editar Ação</h2>
              <p className="text-xs text-gray-400">{acao.nome_cliente || 'Ação independente'}{acao.filial_cliente ? ` · Filial ${acao.filial_cliente}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
          
          {/* Status */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
              <Activity size={10} className="inline mr-1" /> Status da Ação
            </label>
            <div className="flex flex-wrap gap-2">
              {STATUS.map(s => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex-1 justify-center ${
                    status === s.value
                      ? s.color + ' shadow-lg'
                      : 'bg-white/[0.02] border-white/5 text-gray-500 hover:bg-white/5'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tipo de Ação */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Tipo de Ação</label>
            <div className="flex flex-wrap gap-2">
              {TIPOS_ACAO.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTipo(t.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    tipo === t.value
                      ? 'bg-white/10 border-white/20 text-white shadow-lg'
                      : 'bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/5 hover:text-gray-300'
                  }`}
                >
                  <span className={tipo === t.value ? t.color : ''}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Título */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Título</label>
            <input
              type="text"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ex: Ligar e oferecer desconto..."
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
            />
          </div>

          {/* Prioridade */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Prioridade</label>
            <div className="flex gap-2">
              {PRIORIDADES.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPrioridade(p.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex-1 justify-center ${
                    prioridade === p.value
                      ? p.color + ' shadow-lg'
                      : 'bg-white/[0.02] border-white/5 text-gray-500 hover:bg-white/5'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${prioridade === p.value ? p.dot : 'bg-gray-600'}`} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Vendedor + Vencimento em grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                <User size={10} className="inline mr-1" />Vendedor
              </label>
              <select
                value={vendedorSel}
                onChange={e => setVendedorSel(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all"
              >
                <option value="">Selecione...</option>
                {vendedores.map(v => (
                  <option key={v.codigo} value={v.codigo}>{v.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                <Calendar size={10} className="inline mr-1" />Vencimento
              </label>
              <input
                type="date"
                value={dataVencimento}
                onChange={e => setDataVencimento(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all"
              />
            </div>
          </div>

          {/* Instruções */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Instruções (opcional)</label>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Detalhes para o vendedor sobre como abordar o cliente..."
              rows={3}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all resize-none"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-white/[0.01] flex items-center justify-end gap-3">
          {erro && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-red-400 mr-auto">
              <AlertTriangle size={14} /> {erro}
            </p>
          )}
          <button onClick={onClose} className="px-5 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={saving || !titulo.trim()}
            className="px-5 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2 shadow-lg shadow-blue-500/20"
          >
            <Edit2 size={14} />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>

      </div>
    </div>
  );
}
