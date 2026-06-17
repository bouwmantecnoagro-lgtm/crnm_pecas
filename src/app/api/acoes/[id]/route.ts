import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { registrarAtividade } from '@/lib/atividade';

export const dynamic = 'force-dynamic';

async function getUserScope(userId: string): Promise<{
  isAdmin: boolean;
  codVendedores: string[];
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('profiles')
    .select('role, cod_vendedor')
    .eq('id', userId)
    .single();
  return {
    isAdmin: data?.role === 'ADMIN',
    codVendedores: (data?.cod_vendedor as string[] | null) ?? [],
  };
}

// Confere que a ação pertence ao escopo do user. Retorna a ação ou null.
async function ensureScope(
  acaoId: string,
  scope: { isAdmin: boolean; codVendedores: string[] },
) {
  const admin = createAdminClient();
  const { data: acao } = await admin
    .from('crm_acoes')
    .select('*')
    .eq('id', acaoId)
    .single();
  if (!acao) return { acao: null, allowed: false };
  if (scope.isAdmin) return { acao, allowed: true };
  const allowed =
    !!acao.vendedor_responsavel &&
    scope.codVendedores.includes(acao.vendedor_responsavel);
  return { acao, allowed };
}

// PATCH — Atualiza ação (concluir, atualizar status, resultado, etc.)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const scope = await getUserScope(user.id);
    const { acao, allowed } = await ensureScope(id, scope);
    if (!acao) {
      return NextResponse.json({ error: 'Ação não encontrada' }, { status: 404 });
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Acesso negado a esta ação' }, { status: 403 });
    }

    const body = await request.json();
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.status) updates.status = body.status;
    if (body.resultado) updates.resultado = body.resultado;
    if (body.observacoes !== undefined) updates.observacoes = body.observacoes;
    if (body.prioridade) updates.prioridade = body.prioridade;
    if (body.vendedor_responsavel) {
      // Reassignar para outro vendedor: só admin pode, ou se o destino também está no escopo
      if (!scope.isAdmin && !scope.codVendedores.includes(body.vendedor_responsavel)) {
        return NextResponse.json(
          { error: 'Você não pode reatribuir para este vendedor.' },
          { status: 403 },
        );
      }
      updates.vendedor_responsavel = body.vendedor_responsavel;
    }
    if (body.nome_vendedor) updates.nome_vendedor = body.nome_vendedor;
    if (body.data_vencimento) updates.data_vencimento = body.data_vencimento;

    if (body.status === 'CONCLUIDA') {
      updates.data_conclusao = new Date().toISOString();
    }
    if (body.status === 'REAGENDADA' || body.status === 'PENDENTE') {
      updates.data_conclusao = null;
    }

    const admin = createAdminClient();
    const { data: updatedAcao, error } = await admin
      .from('crm_acoes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Log de atividade (fiscal de adoção).
    let eventoLog: 'REAGENDAR_ACAO' | 'CONCLUIR_ACAO' | null = null;
    if (body.resultado === 'REAGENDAR') eventoLog = 'REAGENDAR_ACAO';
    else if (body.status === 'CONCLUIDA' || body.status === 'CANCELADA' || body.resultado) eventoLog = 'CONCLUIR_ACAO';
    if (eventoLog) {
      registrarAtividade({
        userId: user.id,
        userEmail: user.email,
        evento: eventoLog,
        detalhe: updatedAcao?.titulo || null,
        codigoCliente: updatedAcao?.codigo_cliente,
        numeroOrcamento: updatedAcao?.numero_orcamento,
      });
    }

    // Se o resultado for SEM_MAQUINA, removemos da carteira do vendedor
    if (body.resultado === 'SEM_MAQUINA' && updatedAcao?.codigo_cliente) {
      await admin
        .from('crm_clientes')
        .update({ VENDEDOR_RESP: null, NOME_VENDEDOR_RESP: null })
        .eq('CODIGO_CLIENTE', updatedAcao.codigo_cliente);
    }

    // Se SEM_INTERESSE e há orçamento vinculado, cancela o orçamento (só no Supabase, via STATUS_OVERRIDE).
    // Atualiza todas as linhas (uma por produto) do mesmo número de orçamento.
    if (body.resultado === 'SEM_INTERESSE' && updatedAcao?.numero_orcamento) {
      await admin
        .from('crm_orcamentos')
        .update({ STATUS_OVERRIDE: 'CANCELADO' })
        .eq('ORC_NUMERO_ORCAMENTO', String(updatedAcao.numero_orcamento));
    }

    // Se MAQUINA_OUTRA_MARCA, persiste a marca/modelo no cadastro do cliente.
    // Permite oferecer consumíveis compatíveis depois e filtrar /clientes por marca concorrente.
    if (
      body.resultado === 'MAQUINA_OUTRA_MARCA' &&
      body.marca_concorrente &&
      updatedAcao?.codigo_cliente
    ) {
      const clienteUpdate: any = {
        MARCA_CONCORRENTE: String(body.marca_concorrente).trim().toUpperCase(),
        MODELO_CONCORRENTE: body.modelo_concorrente
          ? String(body.modelo_concorrente).trim().toUpperCase()
          : null,
        DATA_MARCA_CONCORRENTE: new Date().toISOString(),
      };
      let q = admin
        .from('crm_clientes')
        .update(clienteUpdate)
        .eq('CODIGO_CLIENTE', updatedAcao.codigo_cliente);
      if (updatedAcao.loja_cliente) {
        q = q.eq('LOJA_CLIENTE', updatedAcao.loja_cliente);
      }
      await q;
    }

    return NextResponse.json(updatedAcao);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — Soft delete (marca como CANCELADA)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const scope = await getUserScope(user.id);
    const { acao, allowed } = await ensureScope(id, scope);
    if (!acao) {
      return NextResponse.json({ error: 'Ação não encontrada' }, { status: 404 });
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Acesso negado a esta ação' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('crm_acoes')
      .update({ status: 'CANCELADA', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
