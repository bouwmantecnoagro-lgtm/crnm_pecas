'use client';

import { useEffect, useState, useMemo, useDeferredValue } from 'react';
import { MapPin, Search, Tag, X, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import Cliente360Modal from '@/components/Cliente360Modal';

import { useData } from '@/contexts/DataContext';
import { diasEf, recenciaDeOutraFilial } from '@/lib/recencia';
import { TabelaClientesSkeleton } from '@/components/Skeletons';

export default function ClientesPage() {
  const { clientes, loading } = useData();
  const [busca, setBusca] = useState('');
  const deferredBusca = useDeferredValue(busca);

  // Pagination
  const [paginaAtual, setPaginaAtual] = useState(1);
  const ITENS_POR_PAGINA = 50;

  // Advanced Filters
  const [statusFiltro, setStatusFiltro] = useState('');
  const [ufFiltro, setUfFiltro] = useState('');
  const [diasFiltro, setDiasFiltro] = useState('');
  const [marcaConcFiltro, setMarcaConcFiltro] = useState('');
  const [grupoFiltro, setGrupoFiltro] = useState(''); // '' | '__ANY__' | '<cnpj_raiz>'
  const [obsFiltro, setObsFiltro] = useState(false); // só clientes com observação
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null);

  const [cliente360, setCliente360] = useState<{ codigo: string, loja: string, filial?: string | null } | null>(null);

  const isBuscandoCurto = deferredBusca.length > 0 && deferredBusca.length < 3;

  // Reset pagina current qnd os filtros mudarem
  useEffect(() => {
    setPaginaAtual(1);
  }, [deferredBusca, statusFiltro, ufFiltro, diasFiltro, marcaConcFiltro, grupoFiltro, obsFiltro]);

  const marcasConcorrentes = useMemo(
    () => Array.from(new Set(clientes.map(c => c.MARCA_CONCORRENTE).filter(Boolean))).sort(),
    [clientes],
  );

  // Contagem por raiz de CNPJ/CPF — usado pra detectar grupos (2+ clientes com mesma raiz).
  const gruposCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clientes) {
      if (!c.CNPJ_RAIZ) continue;
      m.set(c.CNPJ_RAIZ, (m.get(c.CNPJ_RAIZ) || 0) + 1);
    }
    return m;
  }, [clientes]);

  const filtrados = useMemo(() => {
    if (!clientes) return [];
    if (isBuscandoCurto) return []; // Retorna vazio enquanto digita a string curta

    // Performance: calcula o .toLowerCase() uma vez só
    const term = deferredBusca.toLowerCase();

    return clientes.filter(c => {
      // Evita erro se c.CODIGO_CLIENTE vier como numérico do banco
      const strNome = c.NOME_CLIENTE ? String(c.NOME_CLIENTE).toLowerCase() : '';
      const strCod = c.CODIGO_CLIENTE ? String(c.CODIGO_CLIENTE).toLowerCase() : '';
      const strObs = c.OBSERVACAO_VENDEDOR ? String(c.OBSERVACAO_VENDEDOR).toLowerCase() : '';

      const passaBusca = term ? (strNome.includes(term) || strCod.includes(term) || strObs.includes(term)) : true;
      const passaObs = obsFiltro ? !!c.OBSERVACAO_VENDEDOR : true;
      const passaStatus = statusFiltro ? c.STATUS_BASE === statusFiltro : true;
      const passaUf = ufFiltro ? c.UF === ufFiltro : true;

      // dias efetivo = compra mais recente entre todas as filiais do grupo (CNPJ_RAIZ)
      const dias = diasEf(c);
      let passaDias = true;
      if (diasFiltro === '30') passaDias = dias != null && dias > 30;
      if (diasFiltro === '90') passaDias = dias != null && dias > 90;
      if (diasFiltro === '120') passaDias = dias != null && dias > 120;

      let passaMarca = true;
      if (marcaConcFiltro === '__ANY__') passaMarca = !!c.MARCA_CONCORRENTE;
      else if (marcaConcFiltro) passaMarca = c.MARCA_CONCORRENTE === marcaConcFiltro;

      let passaGrupo = true;
      if (grupoFiltro === '__ANY__') {
        passaGrupo = !!c.CNPJ_RAIZ && (gruposCount.get(c.CNPJ_RAIZ) || 0) > 1;
      } else if (grupoFiltro) {
        passaGrupo = c.CNPJ_RAIZ === grupoFiltro;
      }

      return passaBusca && passaStatus && passaUf && passaDias && passaMarca && passaGrupo && passaObs;
    });
  }, [clientes, deferredBusca, statusFiltro, ufFiltro, diasFiltro, marcaConcFiltro, grupoFiltro, obsFiltro, gruposCount, isBuscandoCurto]);

  const filtradosOrdenados = useMemo(() => {
    let result = [...filtrados];
    if (sortConfig) {
      result.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [filtrados, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current && current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const ufs = Array.from(new Set(clientes.map(c => c.UF).filter(Boolean))).sort();

  const totalPaginas = Math.ceil(filtradosOrdenados.length / ITENS_POR_PAGINA) || 1;
  const itensPaginados = filtradosOrdenados.slice((paginaAtual - 1) * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="w-full space-y-6">

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500 mb-2">Base de Clientes</h1>
            <p className="text-gray-400">Gerencie e minere informações brutas da sua carteira de clientes.</p>
          </div>
        </div>

        {/* Barra de Filtros Avançados */}
        <div className="glass-panel p-4 flex flex-wrap gap-4 items-center border border-white/5 bg-black/20">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Buscar por Nome ou Código..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-sky-500/50 transition-colors"
            />
          </div>

          <select
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-300 focus:border-sky-500/50 transition-colors"
            value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}
          >
            <option value="">Todos os Status</option>
            <option value="ATIVO">Apenas ATIVO</option>
            <option value="BLOQUEADO">Apenas BLOQUEADO</option>
            <option value="INATIVO">Apenas INATIVO</option>
          </select>

          <select
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-300 focus:border-sky-500/50 transition-colors"
            value={ufFiltro} onChange={e => setUfFiltro(e.target.value)}
          >
            <option value="">Todos os Estados</option>
            {ufs.map(uf => <option key={uf as string} value={uf as string}>{uf as string}</option>)}
          </select>

          <select
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-300 focus:border-sky-500/50 transition-colors"
            value={diasFiltro} onChange={e => setDiasFiltro(e.target.value)}
          >
            <option value="">Qualquer tempo de Inatividade</option>
            <option value="30">Mais de 30 dias inativo</option>
            <option value="90">Risco (&gt; 90 dias)</option>
            <option value="120">Evasão (&gt; 120 dias)</option>
          </select>

          <select
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-300 focus:border-purple-500/50 transition-colors"
            value={marcaConcFiltro} onChange={e => setMarcaConcFiltro(e.target.value)}
            title="Filtra clientes com máquina concorrente registrada (via ação MAQUINA_OUTRA_MARCA)"
          >
            <option value="">Qualquer Marca Concorrente</option>
            <option value="__ANY__">Apenas com máquina concorrente</option>
            {marcasConcorrentes.map(m => <option key={m as string} value={m as string}>{m as string}</option>)}
          </select>

          <select
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-300 focus:border-sky-500/50 transition-colors"
            value={grupoFiltro} onChange={e => setGrupoFiltro(e.target.value)}
            title="Agrupa clientes pelo mesmo CNPJ raiz (matriz + filiais) ou pelo CPF"
          >
            <option value="">Qualquer Grupo</option>
            <option value="__ANY__">Apenas clientes em grupo (2+ filiais)</option>
          </select>

          <button
            onClick={() => setObsFiltro(v => !v)}
            className={`text-sm px-4 py-2 rounded-lg border transition-colors flex items-center gap-1.5 ${obsFiltro ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-black/40 text-gray-300 border-white/10 hover:text-white'}`}
            title="Mostrar apenas clientes com observação"
          >
            📝 Com observação
          </button>

          {grupoFiltro && grupoFiltro !== '__ANY__' && (
            <span className="text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <Users size={12} /> Grupo {grupoFiltro}
              <button onClick={() => setGrupoFiltro('')} className="ml-1 hover:text-white"><X size={12} /></button>
            </span>
          )}

          {(busca || statusFiltro || ufFiltro || diasFiltro || marcaConcFiltro || grupoFiltro || obsFiltro || sortConfig) && (
            <button
              onClick={() => { setBusca(''); setStatusFiltro(''); setUfFiltro(''); setDiasFiltro(''); setMarcaConcFiltro(''); setGrupoFiltro(''); setObsFiltro(false); setSortConfig(null); }}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
            >
              <X size={14} /> Limpar
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <TabelaClientesSkeleton />
      ) : (
        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="text-xs uppercase bg-white/[0.03] text-gray-400">
                <tr>
                  <th className="px-6 py-4 font-semibold border-b border-white/5 cursor-pointer hover:bg-white/5" onClick={() => handleSort('NOME_CLIENTE')}>Cliente ↕</th>
                  <th className="px-6 py-4 font-semibold border-b border-white/5 cursor-pointer hover:bg-white/5" onClick={() => handleSort('CIDADE')}>Localização ↕</th>
                  <th className="px-6 py-4 font-semibold border-b border-white/5 cursor-pointer hover:bg-white/5" onClick={() => handleSort('TELEFONE')}>Contato ↕</th>
                  <th className="px-6 py-4 font-semibold border-b border-white/5 cursor-pointer hover:bg-white/5" onClick={() => handleSort('DIAS_SEM_COMPRA_EFETIVO')}>Dias sem Comprar ↕</th>
                  <th className="px-6 py-4 font-semibold border-b border-white/5 cursor-pointer hover:bg-white/5" onClick={() => handleSort('STATUS_BASE')}>Status ↕</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isBuscandoCurto && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sky-400 font-mono text-sm blink">
                      Digite pelo menos 4 caracteres para iniciar a busca...
                    </td>
                  </tr>
                )}
                {!isBuscandoCurto && itensPaginados.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setCliente360({ codigo: c.CODIGO_CLIENTE, loja: c.LOJA_CLIENTE, filial: c.FILIAL })}
                    className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white group-hover:text-emerald-300 transition-colors">{c.NOME_CLIENTE || 'N/A'}</span>
                        {c.CNPJ_RAIZ && (gruposCount.get(c.CNPJ_RAIZ) || 0) > 1 && (
                          <button
                            onClick={e => { e.stopPropagation(); setGrupoFiltro(c.CNPJ_RAIZ); }}
                            className="text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-sky-500/25 transition-colors"
                            title={`Ver as ${gruposCount.get(c.CNPJ_RAIZ)} filiais do grupo`}
                          >
                            <Users size={10} /> Grupo {gruposCount.get(c.CNPJ_RAIZ)}
                          </button>
                        )}
                        {c.MARCA_CONCORRENTE && (
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full"
                            title={c.MODELO_CONCORRENTE ? `Modelo: ${c.MODELO_CONCORRENTE}` : 'Marca concorrente'}
                          >
                            🚜 {c.MARCA_CONCORRENTE}
                          </span>
                        )}
                        {c.OBSERVACAO_VENDEDOR && (
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full"
                            title={c.OBSERVACAO_VENDEDOR}
                          >
                            📝 Obs
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 font-mono mt-1">ID: {c.CODIGO_CLIENTE} Lj: {c.LOJA_CLIENTE}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-gray-300">
                        <MapPin size={14} className="text-gray-500" />
                        {c.CIDADE}-{c.UF}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-300">{c.TELEFONE || c.CELULAR_WHATSAPP_CONTATO || '—'}</div>
                      <div className="text-xs text-gray-500 max-w-[200px] truncate" title={c.EMAIL}>{c.EMAIL}</div>
                    </td>
                    <td className="px-6 py-4">
                      {diasEf(c) !== null ? (
                        <div className={`font-semibold ${(diasEf(c) as number) > 90 ? 'text-red-400' : (diasEf(c) as number) > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {diasEf(c)} dias
                          {recenciaDeOutraFilial(c) && (
                            <span
                              className="ml-1.5 text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded-full"
                              title={`Comprou há ${diasEf(c)} dias na filial ${c.FILIAL_GRUPO_RECENTE} (mesmo CPF/CNPJ). Este cadastro está há ${c.DIAS_SEM_COMPRA} dias parado.`}
                            >
                              📍 filial {c.FILIAL_GRUPO_RECENTE}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500 text-xs">Sem Histórico</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider ${c.STATUS_BASE === 'ATIVO' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                        {c.STATUS_BASE}
                      </span>
                    </td>
                  </tr>
                ))}
                {!isBuscandoCurto && itensPaginados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Controles de Paginação */}
          {!isBuscandoCurto && filtradosOrdenados.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-white/[0.02] border-t border-white/5 gap-4">
              <span className="text-sm text-gray-400">
                Mostrando <span className="font-medium text-white">{((paginaAtual - 1) * ITENS_POR_PAGINA) + 1}</span> a{' '}
                <span className="font-medium text-white">{Math.min(paginaAtual * ITENS_POR_PAGINA, filtradosOrdenados.length)}</span> de{' '}
                <span className="font-medium text-white">{filtradosOrdenados.length}</span> clientes
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

      {/* MODAL 360 GRAUS */}
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
