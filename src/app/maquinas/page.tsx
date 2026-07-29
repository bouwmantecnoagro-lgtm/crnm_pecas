'use client';

import { useEffect, useState, useMemo, useDeferredValue } from 'react';
import { Loader2, Search, MapPin, X } from 'lucide-react';
import Cliente360Modal from '@/components/Cliente360Modal';

import { useData } from '@/contexts/DataContext';

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

export default function MaquinasPage() {
  const { maquinas, loading } = useData();
  const [busca, setBusca] = useState('');
  const deferredBusca = useDeferredValue(busca);
  const [pagina, setPagina] = useState(1);
  const ITENS_POR_PAGINA = 50;

  // Advanced Filters
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [fabricanteFiltro, setFabricanteFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [somenteRecentes, setSomenteRecentes] = useState(false);
  const [diasFiltroRecente, setDiasFiltroRecente] = useState(90);
  const [cliente360, setCliente360] = useState<{ codigo: string, loja: string, filial?: string | null } | null>(null);

  // Quando o usuário chega via /maquinas?recentes=N (vindo do card Cross-Sell), ativa o filtro
  // automaticamente para o mesmo período mostrado no dashboard.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const r = sp.get('recentes');
    if (r) {
      const n = parseInt(r, 10);
      if (!isNaN(n) && n > 0) setDiasFiltroRecente(n);
      setSomenteRecentes(true);
    }
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [deferredBusca, categoriaFiltro, fabricanteFiltro, estadoFiltro, somenteRecentes, diasFiltroRecente]);

  const filtrados = useMemo(() => {
    return maquinas.filter(m => {
      const term = deferredBusca.toLowerCase();
      const strFabricante = String(m.FABRICANTE || m.marca || '').toLowerCase();
      const passaBusca = (m.CHASSI?.toLowerCase() || '').includes(term) || 
                         (m.MODELO?.toLowerCase() || '').includes(term) || 
                         (m.NOME_CLIENTE?.toLowerCase() || '').includes(term) ||
                         strFabricante.includes(term);
                         
      const passaCategoria = categoriaFiltro ? String(m.CATEGORIA || '').trim() === categoriaFiltro.trim() : true;
      const passaFabricante = fabricanteFiltro ? String(m.FABRICANTE || m.marca || '').trim() === fabricanteFiltro.trim() : true;
      const passaEstado = estadoFiltro ? String(m.ESTADO || '').trim() === estadoFiltro.trim() : true;

      let passaRecente = true;
      if (somenteRecentes && m.EMISSAO) {
        const dt = new Date(m.EMISSAO.toString().includes('Date') ? parseInt(m.EMISSAO.match(/\d+/)![0]) : m.EMISSAO);
        if (!isNaN(dt.getTime())) {
          const diasAge = Math.floor((new Date().getTime() - dt.getTime()) / (1000 * 60 * 60 * 24));
          passaRecente = diasAge <= diasFiltroRecente;
        } else {
          passaRecente = false;
        }
      } else if (somenteRecentes && !m.EMISSAO) {
        passaRecente = false;
      }

      return passaBusca && passaCategoria && passaFabricante && passaEstado && passaRecente;
    });
  }, [maquinas, deferredBusca, categoriaFiltro, fabricanteFiltro, estadoFiltro, somenteRecentes, diasFiltroRecente]);

  const categorias = useMemo(() => Array.from(new Set(maquinas.map(m => String(m.CATEGORIA || '').trim()).filter(Boolean))).sort(), [maquinas]);
  const fabricantes = useMemo(() => Array.from(new Set(maquinas.map(m => String(m.FABRICANTE || m.marca || '').trim()).filter(Boolean))).sort(), [maquinas]);

  const paginados = useMemo(() => {
    const start = (pagina - 1) * ITENS_POR_PAGINA;
    return filtrados.slice(start, start + ITENS_POR_PAGINA);
  }, [filtrados, pagina]);
  
  const totalPaginas = Math.ceil(filtrados.length / ITENS_POR_PAGINA);

  return (
    <div className="flex-1 overflow-y-auto animate-in fade-in duration-500">
      <div className="w-full space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500 mb-2">Parque de Máquinas</h1>
            <p className="text-gray-400">Consulta de equipamentos para apoio em venda ativa de reposição.</p>
          </div>
        </div>

        {/* Barra de Filtros Avançados */}
        <div className="glass-panel p-4 flex flex-wrap gap-4 items-center border border-white/5 bg-black/20">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input 
              type="text" 
              placeholder="Buscar Modelo, Chassi ou Cliente..." 
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-sky-500/50 transition-colors"
            />
          </div>

          <select 
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-300 focus:border-sky-500/50 transition-colors"
            value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)}
          >
            <option value="">Todas Categorias</option>
            {categorias.map(cat => <option key={cat as string} value={cat as string}>{cat as string}</option>)}
          </select>

          <select 
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-300 focus:border-sky-500/50 transition-colors"
            value={fabricanteFiltro} onChange={e => setFabricanteFiltro(e.target.value)}
          >
            <option value="">Todas as Marcas/Fabricantes</option>
            {fabricantes.map(fab => <option key={fab as string} value={fab as string}>{fab as string}</option>)}
          </select>

          <select 
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-300 focus:border-sky-500/50 transition-colors"
            value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}
          >
            <option value="">Qualquer Estado</option>
            <option value="NOVO">Apenas NOVO</option>
            <option value="USADO">Apenas USADO</option>
          </select>
          
          <button
            onClick={() => setSomenteRecentes(!somenteRecentes)}
            className={`px-4 py-2 text-sm rounded-lg flex items-center gap-2 border transition-colors ${somenteRecentes ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'bg-black/40 text-gray-400 border-white/10 hover:border-amber-500/30'}`}
          >
            ⚡ Limitar a Entregas Recentes ({'<'} {diasFiltroRecente}d)
          </button>
          
          {(busca || categoriaFiltro || fabricanteFiltro || estadoFiltro || somenteRecentes) && (
            <button 
              onClick={() => { setBusca(''); setCategoriaFiltro(''); setFabricanteFiltro(''); setEstadoFiltro(''); setSomenteRecentes(false); }}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 ml-auto"
            >
              <X size={14} /> Limpar
            </button>
          )}
        </div>
        </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={32} className="text-amber-400 animate-spin" />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="text-xs uppercase bg-white/[0.03] text-gray-400">
                <tr>
                  <th className="px-6 py-4 font-semibold border-b border-white/5">Equipamento</th>
                  <th className="px-6 py-4 font-semibold border-b border-white/5">Proprietário</th>
                  <th className="px-6 py-4 font-semibold border-b border-white/5">Localização</th>
                  <th className="px-6 py-4 font-semibold border-b border-white/5">Emissão</th>
                  <th className="px-6 py-4 font-semibold border-b border-white/5 text-right">Valor Venda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginados.map((m) => (
                  <tr key={m.id} className="hover:bg-white/[0.02] transition-colors cursor-pointer group" onClick={() => setCliente360({ codigo: m.COD_CLIENTE || m.CODIGO_CLIENTE, loja: m.LOJA_CLIENTE, filial: m.FILIAL })}>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white group-hover:text-amber-300 transition-colors">{fixEncoding(m.MODELO)}</div>
                      <div className="text-xs text-amber-300 font-mono mt-1">Chassi: {m.CHASSI || '—'}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{m.FABRICANTE} • {fixEncoding(m.ESTADO)} • {fixEncoding(m.CATEGORIA)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-200">{m.NOME_CLIENTE || '—'}</div>
                      <div className="text-xs text-gray-500 mt-1">Vendedor: {m.NOME_VENDEDOR}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 text-gray-400 text-xs">
                        <span className="flex items-center gap-1"><MapPin size={12}/> {m.MUNICIPIO}-{m.UF_MUN_CLIENTE?.substring(0,2) || ''}</span>
                        <span>Região: {m.REGIAO || '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {m.EMISSAO ? (
                        <>
                          <div>Data: {m.EMISSAO}</div>
                          <div>NF: {m.NOTA_FISCAL}</div>
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {m.TOTAL !== null ? (
                        <div className="font-bold text-amber-100">
                          R$ {m.TOTAL.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                        </div>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      Nenhuma máquina encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Controles de Paginação */}
          {totalPaginas > 1 && (
            <div className="p-4 border-t border-white/5 flex items-center justify-between bg-black/20 text-sm">
              <span className="text-gray-400">
                Mostrando {(pagina - 1) * ITENS_POR_PAGINA + 1} até {Math.min(pagina * ITENS_POR_PAGINA, filtrados.length)} de {filtrados.length} resultados
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                  disabled={pagina === 1}
                  className="px-3 py-1 rounded-md bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-50 transition-colors"
                >
                  Anterior
                </button>
                <div className="flex items-center gap-1">
                  <span className="w-8 text-center bg-transparent border-none text-white">{pagina}</span>
                  <span className="text-gray-500">/</span>
                  <span className="text-gray-500">{totalPaginas}</span>
                </div>
                <button
                  onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                  disabled={pagina === totalPaginas}
                  className="px-3 py-1 rounded-md bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-50 transition-colors"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
