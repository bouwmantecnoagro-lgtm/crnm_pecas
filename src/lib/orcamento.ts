// Helper único para o status efetivo do orçamento.
// STATUS_OVERRIDE é setado pelo CRM (ex: ação "Sem Interesse" cancela) e
// prevalece sobre STATUS vindo do ERP. Sync nunca toca STATUS_OVERRIDE.
export function getStatusOrcamento(o: any): string {
  const raw = o?.STATUS_OVERRIDE || o?.Status || o?.STATUS || '';
  return String(raw).toUpperCase().trim();
}

// ORC_DATA_ORCAMENTO carrega a VALIDADE do orçamento (VS1_DATVAL no ERP), não a emissão.
// True se a validade ainda não passou (orçamento de fato em aberto hoje).
export function isValidadeVigente(o: any): boolean {
  const venc = o?.ORC_DATA_ORCAMENTO;
  if (!venc) return true; // sem validade definida → não rebaixa (defensivo)
  const d = new Date(String(venc).split('T')[0] + 'T00:00:00');
  if (isNaN(d.getTime())) return true;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return d >= hoje;
}

// Status "vivo": o sync congela o rótulo no momento da extração, mas um orçamento
// ABERTO cuja validade já passou é VENCIDO de fato — é como o ERP/BI re-derivam ao
// vivo (CASE WHEN VS1_DATVAL >= GETDATE() THEN 'ABERTO' ELSE 'VENCIDO'). Reclassifica
// na leitura pra não contar "aberto fantasma". Use este no lugar de getStatusOrcamento
// para qualquer bucketing/contagem por status.
export function getStatusVivo(o: any): string {
  const s = getStatusOrcamento(o);
  if ((s === 'ABERTO' || s === 'EM ABERTO') && !isValidadeVigente(o)) return 'VENCIDO';
  return s;
}

export const STATUS_FECHADOS = new Set(['FATURADO', 'CANCELADO', 'VENCIDO']);

// Mapeamento nome técnico (ERP) → nome comercial (UI).
// O ERP entrega FATURADO/CANCELADO/VENCIDO/ABERTO; o vendedor lê como GANHO/PERDIDO/VENCIDO/ABERTO.
// Use SEMPRE este helper ao renderizar badges, options de filtro, headers de tabela e subtítulos de KPI.
// Lógica interna (Win Rate, STATUS_FECHADOS, queries) continua usando o nome técnico.
export function labelStatusOrcamento(status: string): string {
  const s = String(status || '').toUpperCase().trim();
  if (s === 'FATURADO') return 'GANHO';
  if (s === 'CANCELADO') return 'PERDIDO';
  if (s === 'VENCIDO') return 'VENCIDO';
  if (s === 'ABERTO' || s === 'EM ABERTO' || s === '') return 'ABERTO';
  return s;
}
