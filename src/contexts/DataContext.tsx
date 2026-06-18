'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface DataContextProps {
  clientes: any[];
  orcamentos: any[];
  maquinas: any[];
  acoes: any[];
  loading: boolean;
  loadingOrcamentos: boolean;
  ultimaSync: string;
  refreshAcoes: () => void;
}

const DataContext = createContext<DataContextProps>({
  clientes: [],
  orcamentos: [],
  maquinas: [],
  acoes: [],
  loading: true,
  loadingOrcamentos: true,
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
// v12: a view crm_recencia_grupo quebrava no select completo (DATA_ULT_COMPRA em formato
//      .NET "/Date(...)/" estourava o cast ::date) → API caía no fallback e a consolidação
//      nunca aplicava. View corrigida; bump invalida o cache que guardou o dia cru.
const CACHE_VERSION = 12;
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
  const [loadingOrcamentos, setLoadingOrcamentos] = useState(true);
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

    // Calcula "última sync" pelo maior updated_at entre as coleções fornecidas.
    const aplicarUltimaSync = (...arrs: any[][]) => {
      const comData = arrs.flat().filter((r: any) => r?.updated_at);
      if (comData.length === 0) return;
      const maxTs = comData.reduce((max: number, r: any) => {
        const t = new Date(r.updated_at).getTime();
        return t > max ? t : max;
      }, 0);
      setUltimaSync(new Date(maxTs).toLocaleString('pt-BR'));
    };

    async function carregarDados() {
      try {
        const isDemo = typeof window !== 'undefined' && window.location.search.includes('demo=true');

        if (isDemo) {
          const demo = await (await fetch('/demo_data.json')).json();
          if (!isMounted) return;
          setClientes(demo.clientes || []);
          setMaquinas(demo.maquinas || []);
          setAcoes(demo.acoes || []);
          setOrcamentos(demo.orcamentos || []);
          aplicarUltimaSync(demo.clientes || [], demo.orcamentos || []);
          setLoading(false);
          setLoadingOrcamentos(false);
          return;
        }

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          // Sem sessão — middleware deveria ter redirecionado.
          if (isMounted) { setLoading(false); setLoadingOrcamentos(false); }
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
          if (!isMounted) return;
          setClientes(Array.isArray(cached.cli) ? cached.cli : []);
          setMaquinas(Array.isArray(cached.maq) ? cached.maq : []);
          setAcoes(Array.isArray(cached.acoesData) ? cached.acoesData : []);
          setOrcamentos(Array.isArray(cached.orc) ? cached.orc : []);
          aplicarUltimaSync(cached.cli || [], cached.orc || []);
          setLoading(false);
          setLoadingOrcamentos(false);
          return;
        }

        // FASE 1 — clientes/máquinas/ações (leves, ~11k linhas): liberam a UI
        // imediatamente, sem esperar os ~37k orçamentos.
        const [resCli, resMaq, resAcoes] = await Promise.all([
          fetch('/api/dados?tabela=crm_clientes'),
          fetch('/api/dados?tabela=crm_parquemaquinas'),
          fetch('/api/acoes'),
        ]);
        const [cli, maq, acoesData] = await Promise.all([resCli.json(), resMaq.json(), resAcoes.json()]);
        if (!isMounted) return;
        if (Array.isArray(cli)) setClientes(cli);
        if (Array.isArray(maq)) setMaquinas(maq);
        if (Array.isArray(acoesData)) setAcoes(acoesData);
        aplicarUltimaSync(Array.isArray(cli) ? cli : []);
        setLoading(false);

        // FASE 2 — orçamentos (pesado): carrega em segundo plano. Telas que
        // dependem deles (Pipeline, Orçamentos, rankings/funil) observam loadingOrcamentos.
        const orc = await (await fetch('/api/dados?tabela=crm_orcamentos')).json();
        if (!isMounted) return;
        if (Array.isArray(orc)) setOrcamentos(orc);
        aplicarUltimaSync(Array.isArray(cli) ? cli : [], Array.isArray(orc) ? orc : []);
        setLoadingOrcamentos(false);
        writeCache(user.id, { cli, orc, maq, acoesData });
      } catch (err) {
        console.error('Erro ao carregar dados pro cache global:', err);
      } finally {
        if (isMounted) { setLoading(false); setLoadingOrcamentos(false); }
      }
    }
    carregarDados();
    return () => { isMounted = false; };
  }, []);

  return (
    <DataContext.Provider value={{ clientes, orcamentos, maquinas, acoes, loading, loadingOrcamentos, ultimaSync, refreshAcoes: fetchAcoes }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => useContext(DataContext);
