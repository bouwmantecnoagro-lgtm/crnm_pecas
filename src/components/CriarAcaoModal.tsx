'use client';

import { useState } from 'react';
import { X, Zap, Phone, MessageCircle, Mail, MapPin, FileText, Package, HelpCircle, Calendar, User, AlertTriangle } from 'lucide-react';
import { getCategoriaAcao } from '@/lib/acao';

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

interface CriarAcaoModalProps {
  clienteCodigo?: string | number;
  clienteLoja?: string | number;
  clienteNome?: string;
  numeroOrcamento?: string;
  tipoSugerido?: string;
  origemTela: string;
  vendedores: { codigo: string; nome: string }[];
  onClose: () => void;
  onSave: () => void;
}

export default function CriarAcaoModal({
  clienteCodigo,
  clienteLoja,
  clienteNome,
  numeroOrcamento,
  tipoSugerido,
  origemTela,
  vendedores,
  onClose,
  onSave,
}: CriarAcaoModalProps) {
  const [tipo, setTipo] = useState(tipoSugerido || 'LIGAR');
  const [prioridade, setPrioridade] = useState('MEDIA');
  const [vendedorSel, setVendedorSel] = useState('');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataVencimento, setDataVencimento] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [saving, setSaving] = useState(false);
  const cat = getCategoriaAcao({ tipo, origem: origemTela });

  // Auto-gerar título quando tipo muda
  const gerarTitulo = (t: string) => {
    const prefixos: Record<string, string> = {
      LIGAR: 'Ligar para',
      WHATSAPP: 'Enviar WhatsApp para',
      EMAIL: 'Enviar e-mail para',
      VISITA: 'Agendar visita em',
      FOLLOW_UP_ORCAMENTO: 'Follow-up orçamento de',
      OFERTA_PECAS: 'Oferecer peças para',
      OUTRO: 'Ação para',
    };
    return `${prefixos[t] || 'Ação para'} ${clienteNome || 'cliente'}`;
  };

  const handleTipoChange = (t: string) => {
    setTipo(t);
    if (!titulo || titulo === gerarTitulo(tipo)) {
      setTitulo(gerarTitulo(t));
    }
  };

  // Preencher título automaticamente ao montar se estiver vazio
  if (!titulo && clienteNome) {
    setTitulo(gerarTitulo(tipo));
  }

  const handleSalvar = async () => {
    if (!titulo.trim()) return;
    setSaving(true);

    const vendedorObj = vendedores.find(v => v.codigo === vendedorSel);

    try {
      const res = await fetch('/api/acoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          prioridade,
          codigo_cliente: clienteCodigo || null,
          loja_cliente: clienteLoja || null,
          nome_cliente: clienteNome || null,
          numero_orcamento: numeroOrcamento || null,
          vendedor_responsavel: vendedorSel || null,
          nome_vendedor: vendedorObj?.nome || null,
          criado_por: 'GESTOR',
          data_vencimento: dataVencimento || null,
          origem: origemTela,
        }),
      });

      if (!res.ok) throw new Error('Erro ao salvar');
      onSave();
      onClose();
    } catch (err) {
      console.error('Erro ao criar ação:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-[#0b101a] border border-white/10 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-gradient-to-r from-violet-500/10 to-sky-500/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <Zap size={20} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Nova Ação Comercial</h2>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Categoria</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${cat.chip}`}>{cat.label}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
          
          {/* Cliente (se pré-preenchido) */}
          {clienteNome && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-xs font-bold text-sky-400">
                {clienteNome.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{clienteNome}</p>
                <p className="text-[10px] text-gray-500">Cod: {clienteCodigo} Lj: {clienteLoja} {numeroOrcamento ? `• Orç #${numeroOrcamento}` : ''}</p>
              </div>
            </div>
          )}

          {/* Tipo de Ação */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Tipo de Ação</label>
            <div className="flex flex-wrap gap-2">
              {TIPOS_ACAO.map(t => (
                <button
                  key={t.value}
                  onClick={() => handleTipoChange(t.value)}
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
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all"
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
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-all"
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
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-all"
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
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all resize-none"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-white/[0.01] flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={saving || !titulo.trim()}
            className="px-5 py-2 text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-sky-600 hover:from-violet-500 hover:to-sky-500 rounded-lg transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2 shadow-lg shadow-violet-500/20"
          >
            <Zap size={14} />
            {saving ? 'Salvando...' : 'Criar Ação'}
          </button>
        </div>

      </div>
    </div>
  );
}
