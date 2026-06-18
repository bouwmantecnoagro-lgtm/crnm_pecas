'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

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

// v5: cache passou a ser segregado por user_id (chave inclui o sub do JWT).
// Sem isso, vendedor A logando depois de vendedor B no mesmo browser via
// cache de A → vazamento. Incrementar este número sempre que o formato mudar.
// v6: orçamentos passaram a vir com STATUS_OVERRIDE (cancelamento via CRM).
// v7: clientes passaram a vir com MARCA_CONCORRENTE / MODELO_CONCORRENTE / DATA_MARCA_CONCORRENTE.
// v8: clientes passaram a vir com CNPJ_RAIZ (coluna gerada — agrupamento de filiais).
// v9: /api/acoes passou a paginar (antes capava em 1000 — ações com vencimento distante sumiam).
//     Bump invalida o cache truncado anterior e força carga completa.
// v10: clientes passaram a vir com OBSERVACAO_VENDEDOR / DATA_OBSERVACAO / QUEM_OBSERVOU.
// v11: clientes passaram a vir com DIAS_SEM_COMPRA_EFETIVO (recência consolidada por
//      CNPJ_RAIZ — duplicidade entre filiais) + FILIAL_GRUPO_RECENTE / DATA_ULT_COMPRA_GRUPO.
const CACHE_VERSION = 11;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hora

function cacheKeys(userId: string) {
  return {
    data: `crm_data_cache_v${CACHE_VERSION}_${userId}`,
    time: `crm_data_time_v${CACHE_VERSION}_${userId}`,
  };
}

// Limpa caches antigos (versões anteriores + outros users) ao carregar.
function pruneLegacyCache(currentUserId: string) {
  if (typeof window === 'undefined') return;
  try {
    const keep = cacheKeys(currentUserId);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('crm_data_cache_') || k.startsWith('crm_data_time_')) {
        if (k !== keep.data && k !== keep.time) toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignora erro de storage (modo privado, etc)
  }
}

function readCache(userId: string): { cli: any[]; orc: any[]; maq: any[]; acoesData: any[] } | null {
  if (typeof window === 'undefined') return null;
  try {
    const { data: dataKey, time: timeKey } = cacheKeys(userId);
    const cacheStr = localStorage.getItem(dataKey);
    const cacheTime = localStorage.getItem(timeKey);
    if (!cacheStr || !cacheTime) return null;
    if (Date.now() - parseInt(cacheTime) >= CACHE_TTL_MS) return null;
    return JSON.parse(cacheStr);
  } catch {
    return null;
  }
}

function writeCache(userId: string, data: { cli: any[]; orc: any[]; maq: any[]; acoesData: any[] }) {
  if (typeof window === 'undefined') return;
  try {
    const { data: dataKey, time: timeKey } = cacheKeys(userId);
    localStorage.setItem(dataKey, JSON.stringify(data));
    localStorage.setItem(timeKey, Date.now().toString());
  } catch {
    try {
      const { data: dataKey, time: timeKey } = cacheKeys(userId);
      localStorage.removeItem(dataKey);
      localStorage.removeItem(timeKey);
      localStorage.setItem(dataKey, JSON.stringify(data));
      localStorage.setItem(timeKey, Date.now().toString());
    } catch {
      // Sem cache local; servidor segue respondendo.
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
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            // Sem sessão — middleware deveria ter redirecionado. Apenas evita
            // carregar dados sem chave de cache válida.
            if (isMounted) setLoading(false);
            return;
          }

          // Registra acesso (1x por sessão de browser) — fiscal de adoção.
          try {
            if (!sessionStorage.getItem('acesso_logado')) {
              sessionStorage.setItem('acesso_logado', '1');
              fetch('/api/atividade/acesso', { method: 'POST' }).catch(() => {});
            }
          } catch { /* ignora storage indisponível */ }

          pruneLegacyCache(user.id);
          const cached = readCache(user.id);
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
            writeCache(user.id, { cli, orc, maq, acoesData });
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
