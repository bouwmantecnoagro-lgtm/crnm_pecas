'use client';

import { useState } from 'react';
import { X, CheckCircle2, XCircle, Target, CalendarClock, PhoneOff, Trash2, Tractor } from 'lucide-react';

const RESULTADOS = [
  { value: 'CLIENTE_INTERESSADO', label: 'Cliente Interessado', icon: <CheckCircle2 size={16} />, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', desc: 'Demonstrou interesse, próximos passos definidos' },
  { value: 'VENDA_REALIZADA', label: 'Venda Realizada', icon: <Target size={16} />, color: 'bg-sky-500/20 text-sky-400 border-sky-500/30', desc: 'Negócio fechado com sucesso!' },
  { value: 'SEM_INTERESSE', label: 'Sem Interesse', icon: <XCircle size={16} />, color: 'bg-red-500/20 text-red-400 border-red-500/30', desc: 'Cliente declinou a oferta' },
  { value: 'SEM_MAQUINA', label: 'Não tem mais a máquina', icon: <Trash2 size={16} />, color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', desc: 'Removerá o cliente da sua carteira' },
  { value: 'MAQUINA_OUTRA_MARCA', label: 'Máquina de Outra Marca', icon: <Tractor size={16} />, color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', desc: 'Cliente usa concorrente' },
  { value: 'REAGENDAR', label: 'Reagendar', icon: <CalendarClock size={16} />, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', desc: 'Precisa de novo contato em outra data' },
  { value: 'SEM_CONTATO', label: 'Sem Contato', icon: <PhoneOff size={16} />, color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', desc: 'Não conseguiu falar com o cliente' },
];

interface ConcluirAcaoModalProps {
  acao: any;
  onClose: () => void;
  onSave: () => void;
}

export default function ConcluirAcaoModal({ acao, onClose, onSave }: ConcluirAcaoModalProps) {
  const [resultado, setResultado] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [marcaConcorrente, setMarcaConcorrente] = useState('');
  const [modeloConcorrente, setModeloConcorrente] = useState('');
  const [novaData, setNovaData] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [saving, setSaving] = useState(false);

  const isOutraMarca = resultado === 'MAQUINA_OUTRA_MARCA';
  const marcaInvalida = isOutraMarca && !marcaConcorrente.trim();

  const handleSalvar = async () => {
    if (!resultado) return;
    if (marcaInvalida) return;
    setSaving(true);

    const isReagendar = resultado === 'REAGENDAR';

    try {
      let finalStatus = 'CONCLUIDA';
      if (['CLIENTE_INTERESSADO', 'REAGENDAR', 'SEM_CONTATO', 'MAQUINA_OUTRA_MARCA'].includes(resultado)) {
        finalStatus = 'EM_ANDAMENTO';
      } else if (resultado === 'SEM_INTERESSE') {
        // SEM_INTERESSE vai para a coluna "Canceladas" do Kanban (não "Concluídas")
        // e dispara o cancelamento do orçamento vinculado no backend.
        finalStatus = 'CANCELADA';
      }

      const body: any = {
        resultado,
        observacoes: observacoes.trim() || null,
        status: finalStatus,
      };

      if (isReagendar) {
        body.data_vencimento = novaData;
      }

      if (isOutraMarca) {
        body.marca_concorrente = marcaConcorrente.trim();
        body.modelo_concorrente = modeloConcorrente.trim() || null;
      }


      const res = await fetch(`/api/acoes/${acao.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Erro ao atualizar');
      onSave();
      onClose();
    } catch (err) {
      console.error('Erro ao concluir ação:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-[#0b101a] border border-white/10 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-gradient-to-r from-emerald-500/10 to-sky-500/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 size={20} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Registrar Resultado</h2>
              <p className="text-xs text-gray-400 truncate max-w-[260px]">{acao.titulo}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Info da Ação */}
        <div className="px-5 pt-4">
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-400">
              {(acao.nome_cliente || '??').substring(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{acao.nome_cliente || 'N/A'}</p>
              <p className="text-[10px] text-gray-500">{acao.tipo} {acao.numero_orcamento ? `• Orç #${acao.numero_orcamento}` : ''}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          
          {/* Resultado */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Como foi o contato?</label>
            <div className="space-y-2">
              {RESULTADOS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setResultado(r.value)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left border transition-all ${
                    resultado === r.value
                      ? r.color + ' shadow-lg'
                      : 'bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/5'
                  }`}
                >
                  <span className={resultado === r.value ? '' : 'opacity-40'}>{r.icon}</span>
                  <div>
                    <p className="text-sm font-semibold">{r.label}</p>
                    <p className="text-[10px] opacity-60">{r.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Data de reagendamento */}
          {resultado === 'REAGENDAR' && (
            <div className="animate-in slide-in-from-top-2 duration-200">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">Nova data de vencimento</label>
              <input
                type="date"
                value={novaData}
                onChange={e => setNovaData(e.target.value)}
                className="w-full bg-black/30 border border-amber-500/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all"
              />
            </div>
          )}

          {/* Marca + Modelo concorrente */}
          {isOutraMarca && (
            <div className="animate-in slide-in-from-top-2 duration-200 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-purple-400 mb-2">
                  Marca <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={marcaConcorrente}
                  onChange={e => setMarcaConcorrente(e.target.value)}
                  placeholder="John Deere, Kuhn, JF..."
                  className="w-full bg-black/30 border border-purple-500/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-purple-400 mb-2">Modelo</label>
                <input
                  type="text"
                  value={modeloConcorrente}
                  onChange={e => setModeloConcorrente(e.target.value)}
                  placeholder="Opcional — ex: 6110J"
                  className="w-full bg-black/30 border border-purple-500/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 transition-all"
                />
              </div>
              <p className="col-span-2 text-[10px] text-purple-300/70">
                Vai pro cadastro do cliente — pra oferecer consumíveis compatíveis depois.
              </p>
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Observações</label>
            <textarea
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              placeholder="O que o cliente disse? Próximos passos..."
              rows={3}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all resize-none"
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
            disabled={saving || !resultado || marcaInvalida}
            className="px-5 py-2 text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 rounded-lg transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            <CheckCircle2 size={14} />
            {saving ? 'Salvando...' : 'Registrar'}
          </button>
        </div>

      </div>
    </div>
  );
}
