'use client';

import { useState } from 'react';
import { X, GraduationCap, Loader2, CheckCircle2, Info } from 'lucide-react';

interface IndicarTreinamentoModalProps {
  clienteCodigo?: string | number;
  clienteLoja?: string | number;
  clienteNome?: string;
  onClose: () => void;
  onSave?: () => void;
}

// Exemplos de handoff p/ a Paola (rotacionam como placeholder/atalho).
const EXEMPLOS = [
  'Falei com o cliente sobre treinamento da Krone, ele demonstrou interesse.',
  'Comprou peças de manutenção e pode ter equipe precisando de capacitação.',
  'Indiquei treinamento para os operadores — falar com o encarregado.',
];

export default function IndicarTreinamentoModal({
  clienteCodigo,
  clienteLoja,
  clienteNome,
  onClose,
  onSave,
}: IndicarTreinamentoModalProps) {
  const [mensagem, setMensagem] = useState('');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const handleSalvar = async () => {
    setSaving(true);
    setErro(null);
    try {
      const res = await fetch('/api/indicacoes-treinamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo_cliente: clienteCodigo,
          loja_cliente: clienteLoja,
          mensagem: mensagem.trim() || null,
          origem_tela: 'CLIENTE360',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Erro ao indicar treinamento.');
      setOk(true);
      onSave?.();
      setTimeout(onClose, 1100);
    } catch (e: any) {
      setErro(e.message);
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-[#0b101a] border border-white/10 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-gradient-to-r from-sky-500/10 to-emerald-500/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
              <GraduationCap size={20} className="text-sky-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Indicar para Treinamento</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Encaminha o cliente para a Paola (Centro de Treinamentos)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {ok ? (
          <div className="p-10 text-center">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
              <CheckCircle2 size={32} />
            </div>
            <p className="text-white font-semibold">Indicação registrada!</p>
            <p className="text-sm text-gray-400 mt-1">A Paola vai recebê-la no CRM de Treinamentos.</p>
          </div>
        ) : (
          <>
            {/* Body */}
            <div className="p-5 space-y-5">
              {/* Cliente */}
              {clienteNome && (
                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-xs font-bold text-sky-400">
                    {clienteNome.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{clienteNome}</p>
                    <p className="text-[10px] text-gray-500">Cod: {clienteCodigo} Lj: {clienteLoja}</p>
                  </div>
                </div>
              )}

              {/* Mensagem (handoff) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Mensagem para a Paola <span className="text-gray-600 normal-case font-normal">(opcional)</span>
                </label>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={3}
                  placeholder={EXEMPLOS[0]}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 transition-all resize-none"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {EXEMPLOS.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setMensagem(ex)}
                      className="text-[10px] text-sky-300/80 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded-full px-2 py-1 transition-colors text-left"
                    >
                      {ex.length > 38 ? ex.slice(0, 36) + '…' : ex}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-2 text-[11px] text-gray-400 bg-white/[0.02] border border-white/5 rounded-lg p-3">
                <Info size={14} className="text-sky-400 shrink-0 mt-0.5" />
                <span>
                  Você recebe <strong className="text-emerald-300">R$ 50</strong> de bonificação para cada
                  indicação que fechar em treinamento. A indicação fica registrada no seu nome.
                </span>
              </div>

              {erro && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-300">
                  {erro}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 bg-white/[0.01] flex justify-end gap-3">
              <button onClick={onClose} className="px-5 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={saving}
                className="px-5 py-2 text-sm font-bold text-white bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 rounded-lg transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2 shadow-lg shadow-sky-500/20"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <GraduationCap size={14} />}
                {saving ? 'Enviando...' : 'Indicar Treinamento'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
