'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, MapPin, Phone, Mail, Tractor, ReceiptText, ShieldCheck, Flame, Skull, AlertTriangle, MessageCircle, Zap, Clock, CheckCircle2, Edit2, Save, GraduationCap } from 'lucide-react';
import AcaoCard from '@/components/AcaoCard';
import CriarAcaoModal from '@/components/CriarAcaoModal';
import ConcluirAcaoModal from '@/components/ConcluirAcaoModal';
import IndicarTreinamentoModal from '@/components/IndicarTreinamentoModal';
import { useData } from '@/contexts/DataContext';
import { diasEf, recenciaDeOutraFilial } from '@/lib/recencia';
import { Cliente360Skeleton } from '@/components/Skeletons';

function fixEncoding(str: any) {
  if (typeof str !== 'string' || !str) return str;
  return str
    .replace(/FENA\ufffd\ufffdO/gi, 'FENAÇÃO')
    .replace(/FENA\ufffdO/gi, 'FENAÇÃO')
    .replace(/FENA\?O/gi, 'FENAÇÃO')
    .replace(/FENAO/gi, 'FENAÇÃO')
    .replace(/ACESS\ufffdRIOS/gi, 'ACESSÓRIOS')
    .replace(/ACESS\?RIOS/gi, 'ACESSÓRIOS')
    .replace(/ACESSRIOS/gi, 'ACESSÓRIOS')
    .replace(/PULVERIZA\ufffd\ufffdO/gi, 'PULVERIZAÇÃO')
    .replace(/PULVERIZAO/gi, 'PULVERIZAÇÃO')
    .replace(/CONSTRU\ufffd\ufffdO/gi, 'CONSTRUÇÃO')
    .replace(/CONSTRUAO/gi, 'CONSTRUÇÃO');
}

interface Cliente360ModalProps {
  codigoCliente: string;
  lojaCliente: string;
  onClose: () => void;
}

export default function Cliente360Modal({ codigoCliente, lojaCliente, onClose }: Cliente360ModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<'orcamentos' | 'maquinas' | 'acoes'>('orcamentos');
  const [acoesCliente, setAcoesCliente] = useState<any[]>([]);
  const [loadingAcoes, setLoadingAcoes] = useState(false);
  const [criarAcaoModal, setCriarAcaoModal] = useState(false);
  const [concluirAcao, setConcluirAcao] = useState<any>(null);

  // Indicação de treinamento (handoff p/ a Paola)
  const [indicarModal, setIndicarModal] = useState(false);
  const [indicacaoAberta, setIndicacaoAberta] = useState(false);

  // Estados de edição de contato
  const [editandoContato, setEditandoContato] = useState(false);
  const [novoTelefone, setNovoTelefone] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [salvandoContato, setSalvandoContato] = useState(false);

  // Observação livre do vendedor
  const [editandoObs, setEditandoObs] = useState(false);
  const [novaObs, setNovaObs] = useState('');
  const [salvandoObs, setSalvandoObs] = useState(false);

  const { acoes, refreshAcoes, clientes, orcamentos } = useData();

  // Vendedores para o modal de criar ação
  const vendedoresUnicos = Array.from(
    new Map(
      [...clientes.map((c: any) => ({ codigo: c.VENDEDOR_RESP, nome: c.NOME_VENDEDOR_RESP })),
       ...orcamentos.map((o: any) => ({ codigo: o.ORC_CODIGO_VENDEDOR, nome: o.ORC_NOME_VENDEDOR }))]
      .filter(v => v.codigo && v.nome?.trim())
      .map(v => [v.codigo, { codigo: v.codigo, nome: v.nome?.trim() }])
    ).values()
  ).sort((a, b) => a.nome.localeCompare(b.nome));

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/dados/cliente360?codigo_cliente=${codigoCliente}&loja_cliente=${lojaCliente}`);
        const json = await res.json();
        if (!res.ok || json.error) {
          throw new Error(json.error || 'Erro ao carregar os dados do cliente.');
        }
        setData(json);
      } catch (e: any) {
        console.error(e);
        setErrorMsg(e.message);
      }
      setLoading(false);
    }
    load();
  }, [codigoCliente, lojaCliente]);

  // Status da indicação de treinamento (mostra "Indicado" se há uma em aberto)
  async function carregarIndicacao() {
    try {
      const res = await fetch(
        `/api/indicacoes-treinamento?codigo_cliente=${codigoCliente}&loja_cliente=${lojaCliente}`,
      );
      const json = await res.json();
      const aberta = (json.indicacoes || []).some(
        (i: any) => i.status === 'PENDENTE' || i.status === 'CONVERTIDA',
      );
      setIndicacaoAberta(aberta);
    } catch {
      /* silencioso */
    }
  }
  useEffect(() => {
    carregarIndicacao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoCliente, lojaCliente]);

  // Filtrar ações desse cliente do contexto global
  useEffect(() => {
    const filtradas = acoes.filter((a: any) => 
      String(a.codigo_cliente) === String(codigoCliente) && 
      String(a.loja_cliente) === String(lojaCliente)
    );
    setAcoesCliente(filtradas);
  }, [acoes, codigoCliente, lojaCliente]);

  // Preenche dados ao entrar em modo de edição
  useEffect(() => {
    const cliente = data?.cliente;
    if (editandoContato && cliente) {
      setNovoTelefone(cliente.TELEFONE || cliente.CELULAR_WHATSAPP_CONTATO || '');
      setNovoEmail(cliente.EMAIL || '');
    }
  }, [editandoContato, data]);

  if (loading) {
    return <Cliente360Skeleton />;
  }

  if (errorMsg || !data?.cliente) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
        <div className="bg-[#0b101a] border border-red-500/20 w-full max-w-lg rounded-2xl shadow-2xl p-6 text-center" onClick={e => e.stopPropagation()}>
          <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
            <X size={32} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Erro ao carregar cliente</h2>
          <p className="text-gray-400 mb-6">{errorMsg || 'Cliente não encontrado ou dados inconsistentes na base de ERP.'}</p>
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  const handleSalvarContato = async () => {
    if (!data?.cliente) return;
    const cliente = data.cliente;
    setSalvandoContato(true);
    try {
      const payload = {
        codigo_cliente: codigoCliente,
        loja_cliente: lojaCliente,
        nome_cliente: cliente.NOME_CLIENTE,
        email_antigo: cliente.EMAIL,
        email_novo: novoEmail !== cliente.EMAIL ? novoEmail : undefined,
        telefone_antigo: cliente.TELEFONE || cliente.CELULAR_WHATSAPP_CONTATO,
        telefone_novo: novoTelefone !== (cliente.TELEFONE || cliente.CELULAR_WHATSAPP_CONTATO) ? novoTelefone : undefined,
        vendedor_solicitante: cliente.NOME_VENDEDOR_RESP || 'SISTEMA',
      };

      if (!payload.email_novo && !payload.telefone_novo) {
        setEditandoContato(false);
        setSalvandoContato(false);
        return;
      }

      const res = await fetch('/api/clientes/atualizar-contato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Falha ao registrar alteração de contato.');

      const updated = { ...data };
      if (payload.email_novo !== undefined) updated.cliente.EMAIL = novoEmail;
      if (payload.telefone_novo !== undefined) {
        updated.cliente.TELEFONE = novoTelefone;
        updated.cliente.CELULAR_WHATSAPP_CONTATO = novoTelefone;
      }
      setData(updated);
      setEditandoContato(false);
    } catch(err) {
      console.error(err);
      alert('Erro ao salvar contato provisório.');
    }
    setSalvandoContato(false);
  };

  const handleSalvarObservacao = async () => {
    if (!data?.cliente) return;
    setSalvandoObs(true);
    try {
      const res = await fetch('/api/clientes/observacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo_cliente: codigoCliente,
          loja_cliente: lojaCliente,
          nome_cliente: data.cliente.NOME_CLIENTE,
          observacao: novaObs,
        }),
      });
      if (!res.ok) throw new Error('Falha ao salvar observação.');
      const updated = { ...data };
      updated.cliente.OBSERVACAO_VENDEDOR = novaObs.trim() || null;
      updated.cliente.DATA_OBSERVACAO = novaObs.trim() ? new Date().toISOString() : null;
      setData(updated);
      setEditandoObs(false);
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar a observação.');
    }
    setSalvandoObs(false);
  };

  const { cliente, maquinas, orcamentos: orcamentosCliente } = data;

  // Dados calculados — dias efetivo = compra mais recente entre todas as filiais do grupo (CNPJ_RAIZ)
  const diasSemCompra = diasEf(cliente) ?? 0;
  let statusCor = 'text-emerald-400';
  let statusBg = 'bg-emerald-500/10';
  let statusIcon = <ShieldCheck size={13} />;
  let statusTexto = 'Base Saudável';

  if (diasSemCompra > 90) {
    statusCor = 'text-red-400'; statusBg = 'bg-red-500/10'; statusIcon = <Skull size={13} />; statusTexto = 'Evasão (Churn)';
  } else if (diasSemCompra > 60) {
    statusCor = 'text-orange-400'; statusBg = 'bg-orange-500/10'; statusIcon = <Flame size={13} />; statusTexto = 'Risco Alto';
  } else if (diasSemCompra > 30) {
    statusCor = 'text-amber-400'; statusBg = 'bg-amber-500/10'; statusIcon = <AlertTriangle size={13} />; statusTexto = 'Atenção (Esfriando)';
  }

  const acoesAtivas = acoesCliente.filter((a: any) => ['PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA'].includes(a.status));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-[#0b101a] border border-white/10 w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* HEADER */}
        <div className="p-4 border-b border-white/10 flex justify-between items-start gap-3 bg-white/[0.02] shrink-0 relative overflow-hidden">
          {/* Decorative Background */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 rounded-full blur-[80px] pointer-events-none -translate-y-1/2 translate-x-1/3"></div>

          <div className="flex gap-3 items-center relative z-10 min-w-0">
            <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center font-bold text-base border ${statusBg} ${statusCor} border-current/20`}>
              {(cliente.NOME_CLIENTE || '??').substring(0,2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-0.5">
                <h2 className="text-lg font-bold text-white uppercase leading-tight">{cliente.NOME_CLIENTE}</h2>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border border-current ${statusBg} ${statusCor}`}>
                  {statusIcon} {statusTexto}
                </span>
                {recenciaDeOutraFilial(cliente) && (
                  <span
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 border border-sky-500/40 text-sky-300"
                    title={`Este cadastro está há ${cliente.DIAS_SEM_COMPRA} dias sem compra, mas o cliente (mesmo CPF/CNPJ) comprou há ${diasSemCompra} dias na filial ${cliente.FILIAL_GRUPO_RECENTE}.`}
                  >
                    📍 Comprou na filial {cliente.FILIAL_GRUPO_RECENTE}
                  </span>
                )}
                {cliente.STATUS_BASE === 'BLOQUEADO' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 border border-red-500 text-white shadow-[0_0_10px_rgba(220,38,38,0.4)]">
                    ⚠️ BLOQUEADO
                  </span>
                )}
                {cliente.MARCA_CONCORRENTE && (
                  <span
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 border border-purple-500/40 text-purple-300"
                    title={cliente.MODELO_CONCORRENTE ? `Modelo: ${cliente.MODELO_CONCORRENTE}` : 'Marca concorrente registrada via ação'}
                  >
                    🚜 {cliente.MARCA_CONCORRENTE}{cliente.MODELO_CONCORRENTE ? ` ${cliente.MODELO_CONCORRENTE}` : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 flex flex-wrap items-center gap-x-3">
                <span>Cod: <strong className="text-gray-300 font-mono">{cliente.CODIGO_CLIENTE}</strong> Lj: {cliente.LOJA_CLIENTE}</span>
                <span>CNPJ/CPF: {cliente.CNPJ_CPF}</span>
              </p>
            </div>
          </div>
          
          <div className="flex shrink-0 items-center gap-1.5 relative z-10">
            {/* Botão Indicar Treinamento (handoff p/ a Paola) */}
            <button
              onClick={() => setIndicarModal(true)}
              disabled={indicacaoAberta}
              title={indicacaoAberta ? 'Já existe uma indicação em aberto para este cliente' : 'Indicar este cliente para treinamento'}
              className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1 transition-all border ${
                indicacaoAberta
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 cursor-default'
                  : 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/30 text-sky-300'
              }`}
            >
              <GraduationCap size={13} /> {indicacaoAberta ? 'Indicado' : 'Indicar'}
            </button>
            {/* Botão Nova Ação */}
            <button
              onClick={() => setCriarAcaoModal(true)}
              className="px-2.5 py-1.5 bg-gradient-to-r from-violet-600 to-sky-600 hover:from-violet-500 hover:to-sky-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 shadow-lg shadow-violet-500/20 transition-all"
            >
              <Zap size={13} /> Nova Ação
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* BODY - SCROLLABLE */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* LADO ESQUERDO: INFOS DO CLIENTE */}
            <div className="space-y-6">
              
              {/* Card Contato */}
              <div className="glass-panel p-5 space-y-4 relative">
                <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">Contato e Endereço</h3>
                  {!editandoContato ? (
                    <button 
                      onClick={() => setEditandoContato(true)}
                      className="text-gray-500 hover:text-sky-400 transition-colors"
                      title="Editar Contato"
                    >
                      <Edit2 size={14} />
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setEditandoContato(false)}
                        className="text-xs text-gray-400 hover:text-white transition-colors"
                        disabled={salvandoContato}
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={handleSalvarContato}
                        className="flex items-center gap-1 text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-2 py-1 rounded transition-colors"
                        disabled={salvandoContato}
                      >
                        {salvandoContato ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <MapPin className="text-sky-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <p className="text-sm text-white">{cliente.CIDADE} - {cliente.UF}</p>
                      <p className="text-xs text-gray-500">Mapeamento Geográfico</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="text-emerald-400 shrink-0 mt-0.5" size={18} />
                    <div className="flex-1">
                      {editandoContato ? (
                        <input
                          type="text"
                          value={novoTelefone}
                          onChange={e => setNovoTelefone(e.target.value)}
                          className="w-full bg-black/40 border border-emerald-500/30 rounded py-1 px-2 text-sm text-white outline-none focus:border-emerald-500"
                          placeholder="Ex: (00) 00000-0000"
                        />
                      ) : (
                        <p className="text-sm text-white">{cliente.TELEFONE || cliente.CELULAR_WHATSAPP_CONTATO || 'Sem telefone registrado'}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">Contato Direto</p>
                    </div>
                    {/* Botão de Integração WhatsApp */}
                    {!editandoContato && (cliente.TELEFONE || cliente.CELULAR_WHATSAPP_CONTATO) && (
                      <a 
                        href={`https://wa.me/55${(cliente.TELEFONE || cliente.CELULAR_WHATSAPP_CONTATO).replace(/\D/g, '')}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="bg-emerald-500/10 hover:bg-emerald-500/30 text-emerald-400 p-2 rounded-lg transition-colors border border-emerald-500/20"
                        title="Abrir no WhatsApp Web"
                      >
                         <MessageCircle size={16} />
                      </a>
                    )}
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail className="text-amber-400 shrink-0 mt-0.5" size={18} />
                    <div className="break-all flex-1">
                      {editandoContato ? (
                        <input
                          type="email"
                          value={novoEmail}
                          onChange={e => setNovoEmail(e.target.value)}
                          className="w-full bg-black/40 border border-amber-500/30 rounded py-1 px-2 text-sm text-white outline-none focus:border-amber-500"
                          placeholder="email@empresa.com"
                        />
                      ) : (
                        <p className="text-sm text-white">{cliente.EMAIL || 'Não informado'}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">E-mail Principal</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Observação do vendedor */}
              <div className="glass-panel p-5 relative">
                <div className="flex justify-between items-center mb-3 border-b border-white/5 pb-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">Observação</h3>
                  {!editandoObs ? (
                    <button
                      onClick={() => { setNovaObs(cliente.OBSERVACAO_VENDEDOR || ''); setEditandoObs(true); }}
                      className="text-gray-500 hover:text-amber-400 transition-colors"
                      title="Editar observação"
                    >
                      <Edit2 size={14} />
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setEditandoObs(false)} className="text-xs text-gray-400 hover:text-white transition-colors" disabled={salvandoObs}>Cancelar</button>
                      <button onClick={handleSalvarObservacao} className="flex items-center gap-1 text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-2 py-1 rounded transition-colors" disabled={salvandoObs}>
                        {salvandoObs ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
                      </button>
                    </div>
                  )}
                </div>
                {editandoObs ? (
                  <textarea
                    value={novaObs}
                    onChange={e => setNovaObs(e.target.value)}
                    rows={4}
                    placeholder="Ex: tem colhedora John Deere X9 — vendemos navalhas e correias compatíveis."
                    className="w-full bg-black/40 border border-amber-500/30 rounded-lg py-2 px-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-amber-500 resize-none"
                  />
                ) : cliente.OBSERVACAO_VENDEDOR ? (
                  <div>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{cliente.OBSERVACAO_VENDEDOR}</p>
                    {cliente.DATA_OBSERVACAO && (
                      <p className="text-[10px] text-gray-600 mt-2">Atualizada em {new Date(cliente.DATA_OBSERVACAO).toLocaleDateString('pt-BR')}{cliente.QUEM_OBSERVOU ? ` · ${cliente.QUEM_OBSERVOU}` : ''}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 italic">Sem observação. Clique no lápis para adicionar (ex.: produto concorrente p/ o qual temos peças).</p>
                )}
              </div>

              {/* Card Métricas e Vendedor */}
              <div className="glass-panel p-5 border border-sky-500/20 shadow-[0_0_20px_rgba(14,165,233,0.05)]">
                <h3 className="text-sm font-bold uppercase tracking-wider text-sky-500 mb-2 border-b border-sky-500/20 pb-2">Desempenho Comercial</h3>
                
                <div className="mb-4">
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Vendedor Responsável</p>
                  <p className="text-lg font-bold text-white leading-tight">{cliente.NOME_VENDEDOR_RESP || 'S/ Vendedor'}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                      <p className="text-xs text-gray-400 mb-1">Inatividade</p>
                      <p className={`text-2xl font-black ${statusCor}`}>{diasSemCompra} <span className="text-xs font-normal">dias</span></p>
                   </div>
                   <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                      <p className="text-xs text-gray-400 mb-1">Volumetria</p>
                      <p className="text-2xl font-black text-sky-400">{cliente.NF_12M || 0} <span className="text-xs font-normal">NFs (12m)</span></p>
                   </div>
                </div>
              </div>

              {/* Mini card de Ações ativas */}
              {acoesAtivas.length > 0 && (
                <div className="glass-panel p-4 border border-violet-500/20 bg-violet-950/10">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-violet-400 flex items-center gap-2">
                      <Zap size={14} /> Ações Ativas
                    </h3>
                    <span className="text-xs font-black bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full">{acoesAtivas.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {acoesAtivas.slice(0, 3).map((a: any) => (
                      <AcaoCard key={a.id} acao={a} compact onConcluir={() => setConcluirAcao(a)} />
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* LADO DIREITO: ABAS */}
            <div className="md:col-span-2 space-y-4">

              {/* Abas */}
              <div className="flex gap-1 bg-white/[0.02] rounded-xl p-1 border border-white/5">
                <button
                  onClick={() => setAbaAtiva('orcamentos')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    abaAtiva === 'orcamentos' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <ReceiptText size={16} /> Orçamentos ({orcamentosCliente.length})
                </button>
                <button
                  onClick={() => setAbaAtiva('maquinas')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    abaAtiva === 'maquinas' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <Tractor size={16} /> Parque ({maquinas.length})
                </button>
                <button
                  onClick={() => setAbaAtiva('acoes')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    abaAtiva === 'acoes' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20' : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <Zap size={16} /> Ações ({acoesCliente.length})
                  {acoesAtivas.length > 0 && (
                    <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[9px] font-black bg-violet-500 text-white rounded-full px-1">
                      {acoesAtivas.length}
                    </span>
                  )}
                </button>
              </div>
              
              {/* ABA: ORCAMENTOS */}
              {abaAtiva === 'orcamentos' && (
                <div className="glass-panel overflow-hidden border border-emerald-500/20 bg-emerald-950/20 shadow-[0_0_30px_rgba(16,185,129,0.05)]">
                   <div className="p-4 border-b border-emerald-500/20 bg-emerald-500/5 flex justify-between items-center">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                         <ReceiptText size={18} /> 
                         Orçamentos Pendentes ({orcamentosCliente.length})
                      </h3>
                      {orcamentosCliente.length > 0 && (
                        <span className="font-bold text-emerald-300 text-lg">
                          Total R$ {orcamentosCliente.reduce((acc:any, o:any) => acc + o.ORC_VALOR_TOTAL, 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                        </span>
                      )}
                   </div>
                   <div className="p-0">
                      {orcamentosCliente.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">Não há orçamentos em negociação com este cliente.</div>
                      ) : (
                        <table className="w-full text-left text-sm text-gray-300">
                          <thead className="text-[10px] uppercase bg-black/20 text-gray-500">
                            <tr>
                              <th className="px-4 py-3 font-semibold">Cód / Descrição</th>
                              <th className="px-4 py-3 font-semibold text-center">Nº Orçamento</th>
                              <th className="px-4 py-3 font-semibold text-center">Emissão</th>
                              <th className="px-4 py-3 font-semibold text-right">Valor R$</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {orcamentosCliente.map((o: any) => (
                              <tr key={o.id} className="hover:bg-white/[0.02]">
                                <td className="px-4 py-3 max-w-[200px]">
                                  <div className="font-mono text-xs text-sky-400">{o.CODIGO_PRODUTO_ORC}</div>
                                </td>
                                <td className="px-4 py-3 text-center text-gray-400 font-mono text-xs">{o.ORC_NUMERO_ORCAMENTO}</td>
                                <td className="px-4 py-3 text-center text-gray-500 text-xs">{o.ORC_DATA_EMISSAO_ORCAMENTO || '—'}</td>
                                <td className="px-4 py-3 text-right font-bold text-emerald-300">
                                  {o.ORC_VALOR_TOTAL?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                   </div>
                </div>
              )}

              {/* ABA: MAQUINAS */}
              {abaAtiva === 'maquinas' && (
                <div className="glass-panel overflow-hidden border border-amber-500/20 bg-amber-950/20">
                   <div className="p-4 border-b border-amber-500/20 bg-amber-500/5 flex justify-between items-center">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                         <Tractor size={18} /> 
                         Parque Instalado ({maquinas.length})
                      </h3>
                      <p className="text-xs text-gray-400">Oportunidade para Cross-Sell de Peças</p>
                   </div>
                   <div className="p-0">
                      {maquinas.length === 0 ? (
                         <div className="p-8 text-center text-gray-500">Nenhum equipamento registrado (Tabela de Maquinas ERP).</div>
                      ) : (
                        <table className="w-full text-left text-sm text-gray-300">
                          <thead className="text-[10px] uppercase bg-black/20 text-gray-500">
                            <tr>
                              <th className="px-4 py-3 font-semibold">Modelo / Categoria</th>
                              <th className="px-4 py-3 font-semibold">Fabricante</th>
                              <th className="px-4 py-3 font-semibold text-center">Chassi</th>
                              <th className="px-4 py-3 font-semibold text-center">Emissão NF</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {maquinas.map((m: any) => (
                              <tr key={m.id} className="hover:bg-white/[0.02]">
                                <td className="px-4 py-3">
                                  <div className="font-bold text-white">{fixEncoding(m.MODELO) || 'N/A'}</div>
                                  <div className="text-[10px] text-gray-500 uppercase">{fixEncoding(m.CATEGORIA) || 'SEM CATEGORIA'}</div>
                                </td>
                                <td className="px-4 py-3 text-gray-300 text-xs">{m.FABRICANTE || '—'}</td>
                                <td className="px-4 py-3 text-center text-amber-400/80 font-mono text-xs">{m.CHASSI || '—'}</td>
                                <td className="px-4 py-3 text-center text-gray-500 text-xs">{m.EMISSAO || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                   </div>
                </div>
              )}

              {/* ABA: AÇÕES */}
              {abaAtiva === 'acoes' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-violet-400 flex items-center gap-2">
                      <Zap size={16} /> Histórico de Ações
                    </h3>
                    <button
                      onClick={() => setCriarAcaoModal(true)}
                      className="px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 text-xs font-bold rounded-lg border border-violet-500/20 flex items-center gap-1.5 transition-all"
                    >
                      <Zap size={12} /> + Nova Ação
                    </button>
                  </div>

                  {acoesCliente.length === 0 ? (
                    <div className="glass-panel p-12 text-center">
                      <Zap size={40} className="text-gray-700 mx-auto mb-3" />
                      <p className="text-gray-500 mb-3">Nenhuma ação registrada para este cliente.</p>
                      <button
                        onClick={() => setCriarAcaoModal(true)}
                        className="px-4 py-2 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 text-sm font-bold rounded-lg border border-violet-500/20 transition-all"
                      >
                        Criar Primeira Ação
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
                      {acoesCliente.map((a: any) => (
                        <AcaoCard
                          key={a.id}
                          acao={a}
                          onConcluir={a.status !== 'CONCLUIDA' && a.status !== 'CANCELADA' ? () => setConcluirAcao(a) : undefined}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

        </div>

      </div>

      {/* MODAIS */}
      {criarAcaoModal && (
        <CriarAcaoModal
          clienteCodigo={codigoCliente}
          clienteLoja={lojaCliente}
          clienteNome={cliente.NOME_CLIENTE}
          origemTela="CLIENTE360"
          vendedores={vendedoresUnicos}
          onClose={() => setCriarAcaoModal(false)}
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
      {indicarModal && (
        <IndicarTreinamentoModal
          clienteCodigo={codigoCliente}
          clienteLoja={lojaCliente}
          clienteNome={cliente.NOME_CLIENTE}
          onClose={() => setIndicarModal(false)}
          onSave={carregarIndicacao}
        />
      )}
    </div>
  );
}
