// Skeletons de carregamento — mostram a "casca" da tela enquanto o DataContext
// busca os dados, no lugar do spinner. Melhoram a percepção de leveza (o app
// parece responder na hora). Não reduzem o peso real do carregamento.
// Usa animate-pulse do Tailwind (sem CSS novo) e glass-panel do app.

function Sk({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/[0.06] ${className}`} />;
}

function KpiCardSkel() {
  return (
    <div className="glass-panel p-5 space-y-3">
      <div className="flex justify-between items-start">
        <Sk className="h-3 w-24" />
        <Sk className="h-9 w-9 rounded-lg" />
      </div>
      <Sk className="h-8 w-20" />
      <Sk className="h-3 w-28" />
    </div>
  );
}

// Dashboard "Visão Geral": barra de filtros + 6 KPIs + 5 KPIs + área de gráficos.
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="glass-panel p-4 flex flex-wrap gap-4">
        {Array.from({ length: 5 }).map((_, i) => <Sk key={i} className="h-9 w-40" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-5">
        {Array.from({ length: 6 }).map((_, i) => <KpiCardSkel key={i} />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        {Array.from({ length: 5 }).map((_, i) => <KpiCardSkel key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-panel p-5 space-y-4">
            <Sk className="h-4 w-40" />
            <Sk className="h-[220px] w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Tabela "Base de Clientes": cabeçalho + linhas (5 colunas).
export function TabelaClientesSkeleton() {
  return (
    <div className="glass-panel overflow-hidden animate-in fade-in duration-300">
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-6">
        <Sk className="h-3 w-[28%]" />
        <Sk className="h-3 w-[18%]" />
        <Sk className="h-3 w-[18%]" />
        <Sk className="h-3 w-[14%]" />
        <Sk className="h-3 w-[10%]" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="px-6 py-4 border-b border-white/5 flex items-center gap-6">
          <div className="flex-1 space-y-2">
            <Sk className="h-4 w-48" />
            <Sk className="h-3 w-24" />
          </div>
          <Sk className="h-3 w-28" />
          <Sk className="h-3 w-28" />
          <Sk className="h-3 w-16" />
          <Sk className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// Kanban "Carteira / CS Pipeline": 4 colunas com cards.
export function KanbanSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="space-y-2">
        <Sk className="h-8 w-72" />
        <Sk className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex gap-6 overflow-x-auto pb-4 h-[calc(100vh-200px)]">
        {Array.from({ length: 4 }).map((_, c) => (
          <div key={c} className="flex-none w-[340px] flex flex-col h-full bg-[#ffffff02] rounded-xl border border-white/5">
            <div className="p-4 border-b border-white/5 flex justify-between items-center">
              <Sk className="h-4 w-36" />
              <Sk className="h-5 w-14 rounded-md" />
            </div>
            <div className="p-3 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass-panel p-4 space-y-3">
                  <div className="flex justify-between">
                    <Sk className="h-4 w-16" />
                    <Sk className="h-4 w-12" />
                  </div>
                  <Sk className="h-4 w-40" />
                  <Sk className="h-3 w-28" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Modal Cliente 360: cabeçalho + cartões de resumo + abas + lista.
export function Cliente360Skeleton() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0b101a] border border-white/10 w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-white/10 flex gap-4 items-center">
          <Sk className="w-16 h-16 rounded-2xl" />
          <div className="space-y-2">
            <Sk className="h-6 w-64" />
            <Sk className="h-3 w-40" />
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Sk key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="px-6 flex gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Sk key={i} className="h-8 w-28 rounded-lg" />)}
        </div>
        <div className="p-6 space-y-3 flex-1">
          {Array.from({ length: 5 }).map((_, i) => <Sk key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      </div>
    </div>
  );
}
