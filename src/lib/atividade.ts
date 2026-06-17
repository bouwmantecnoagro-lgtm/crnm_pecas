import { createAdminClient } from '@/lib/supabase/admin';

// Eventos rastreados para o "fiscal de adoção".
export type EventoAtividade =
  | 'ACESSO'
  | 'CRIAR_ACAO'
  | 'CONCLUIR_ACAO'
  | 'REAGENDAR_ACAO'
  | 'OBSERVACAO_CLIENTE';

// Registra um evento de atividade. Fire-and-forget: NUNCA propaga erro — logar adoção
// jamais pode quebrar a ação principal do usuário. Escreve via service role (RLS off p/ insert).
export async function registrarAtividade(params: {
  userId?: string | null;
  userEmail?: string | null;
  vendedorCod?: string | null;
  evento: EventoAtividade;
  detalhe?: string | null;
  codigoCliente?: string | number | null;
  numeroOrcamento?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('crm_atividade').insert({
      user_id: params.userId ?? null,
      user_email: params.userEmail ?? null,
      vendedor_cod: params.vendedorCod ?? null,
      evento: params.evento,
      detalhe: params.detalhe ?? null,
      codigo_cliente: params.codigoCliente != null ? String(params.codigoCliente) : null,
      numero_orcamento: params.numeroOrcamento ?? null,
    });
  } catch (e) {
    console.error('Falha ao registrar atividade (ignorado):', e);
  }
}
