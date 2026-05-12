'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface DataContextProps {
  clientes: any[];
  orcamentos: any[];
  maquinas: any[];
  acoes: any[];
  loading: boolean;
  ultimaSync: string;
  refreshAcoes: () => void;
}

const DataContext = createContext<DataContextProps>({
  clientes: [],
  orcamentos: [],
  maquinas: [],
  acoes: [],
  loading: true,
  ultimaSync: '',
  refreshAcoes: () => {},
});

// Incrementar este número sempre que o formato do cache mudar, para invalidar dados antigos.
const CACHE_VERSION = 4;
const CACHE_KEY = `crm_data_cache_v${CACHE_VERSION}`;
const CACHE_TIME_KEY = `crm_data_time_v${CACHE_VERSION}`;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hora

// localStorage persiste entre abas e recarregamentos, evitando que cada aba
// nova faça um novo download completo dos dados.
function readCache(): { cli: any[]; orc: any[]; maq: any[]; acoesData: any[] } | null {
  if (typeof window === 'undefined') return null;
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY);
    const cacheTime = localStorage.getItem(CACHE_TIME_KEY);
    if (!cacheStr || !cacheTime) return null;
    if (Date.now() - parseInt(cacheTime) >= CACHE_TTL_MS) return null;
    return JSON.parse(cacheStr);
  } catch {
    return null;
  }
}

function writeCache(data: { cli: any[]; orc: any[]; maq: any[]; acoesData: any[] }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
  } catch {
    // Quota excedida — apaga o cache antigo e tenta gravar novamente
    try {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_TIME_KEY);
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
    } catch {
      // Se ainda não couber, segue sem cache local (o servidor já faz o cache)
    }
  }
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [clientes, setClientes] = useState<any[]>([]);
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [maquinas, setMaquinas] = useState<any[]>([]);
  const [acoes, setAcoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ultimaSync, setUltimaSync] = useState<string>('');

  const fetchAcoes = useCallback(async () => {
    try {
      const res = await fetch('/api/acoes');
      const data = await res.json();
      if (Array.isArray(data)) setAcoes(data);
    } catch (err) {
      console.error('Erro ao carregar ações:', err);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function carregarDados() {
      try {
        const isDemo = typeof window !== 'undefined' && window.location.search.includes('demo=true');

        let cli, orc, maq, acoesData;

        if (isDemo) {
          const res = await fetch('/demo_data.json');
          const demo = await res.json();
          cli = demo.clientes;
          orc = demo.orcamentos;
          maq = demo.maquinas;
          acoesData = demo.acoes;
        } else {
          const cached = readCache();
          if (cached) {
            cli = cached.cli;
            orc = cached.orc;
            maq = cached.maq;
            acoesData = cached.acoesData;
          } else {
            const [resCli, resOrc, resMaq, resAcoes] = await Promise.all([
              fetch('/api/dados?tabela=crm_clientes'),
              fetch('/api/dados?tabela=crm_orcamentos'),
              fetch('/api/dados?tabela=crm_parquemaquinas'),
              fetch('/api/acoes'),
            ]);
            [cli, orc, maq, acoesData] = await Promise.all([
              resCli.json(), resOrc.json(), resMaq.json(), resAcoes.json(),
            ]);
            writeCache({ cli, orc, maq, acoesData });
          }
        }

        if (isMounted) {
          if (Array.isArray(cli)) setClientes(cli);
          if (Array.isArray(orc)) setOrcamentos(orc);
          if (Array.isArray(maq)) setMaquinas(maq);
          if (Array.isArray(acoesData)) setAcoes(acoesData);

          const todos = [...(Array.isArray(cli) ? cli : []), ...(Array.isArray(orc) ? orc : [])];
          const comData = todos.filter(r => r.updated_at);
          if (comData.length > 0) {
            // reduce em vez de spread para não estourar a call stack com 50k+ itens
            const maxTs = comData.reduce((max, r) => {
              const t = new Date(r.updated_at).getTime();
              return t > max ? t : max;
            }, 0);
            setUltimaSync(new Date(maxTs).toLocaleString('pt-BR'));
          }
        }
      } catch (err) {
        console.error('Erro ao carregar dados pro cache global:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    carregarDados();
    return () => { isMounted = false; };
  }, []);

  return (
    <DataContext.Provider value={{ clientes, orcamentos, maquinas, acoes, loading, ultimaSync, refreshAcoes: fetchAcoes }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => useContext(DataContext);
