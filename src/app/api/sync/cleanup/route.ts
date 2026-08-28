import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// =====================================================================
// /api/sync/cleanup
// Remove "fantasmas": orçamentos que existiam no Supabase mas o ERP não
// devolve mais (geralmente porque viraram pedido faturado e foram movidos
// pra histórico no Protheus). Sem isso, KPIs ficam inflados.
//
// CONTRATO: PowerShell envia a lista de IDs do ERP cujo STATUS é ABERTO
// ou VENCIDO ("estados mutáveis"). O endpoint deleta do Supabase qualquer
// registro com Status IN (ABERTO, EM ABERTO, VENCIDO, null) que NÃO esteja
// na lista E não tenha STATUS_OVERRIDE.
//
// FATURADO e CANCELADO são estados terminais — uma vez nesses, o Protheus
// nunca volta atrás, então não acumulam fantasmas e ficam intocados aqui.
//
// IMPORTANTE: este endpoint DEVE ser chamado DEPOIS do POST /api/sync
// normal (upsert), pra garantir que orçamentos que migraram pra FATURADO/
// CANCELADO já estejam atualizados no Supabase.
// =====================================================================

const ID_PREFIX = (id: string) => id; // já vem no formato FILIAL_NUMERO_PRODUTO

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.SYNC_API_KEY || 'bouwman_sync_ak_7a8b9c0d1e2f3g4h5i';
    if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const payload = await request.json();
    const idsAtivos: string[] = Array.isArray(payload?.OrcamentosAtivos) ? payload.OrcamentosAtivos : [];
    if (idsAtivos.length === 0) {
      return NextResponse.json({ error: 'Payload vazio. Esperado { OrcamentosAtivos: [ids] }' }, { status: 400 });
    }

    // 1. Pega TODOS os ids do Supabase que estão em estado "mutável" e sem override.
    // MIGRAÇÃO (3 views de BI): a lista de ativos passou a ser a view de ABERTOS.
    // Linha com validade já vencida que saiu dessa view não é fantasma — é um
    // VENCIDO legítimo (alimenta win rate e a regra de reativação) e um dia pode
    // voltar como CANCELADO/FATURADO pelas outras views. Só é candidata a deleção
    // a linha cuja validade ainda está vigente (ou sem validade) e que mesmo
    // assim o ERP não devolve — essa sim sumiu de verdade (ex.: arquivada).
    const hoje = new Date().toISOString().split('T')[0];
    const candidatos: string[] = [];
    const step = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('crm_orcamentos')
        .select('id, ORC_DATA_ORCAMENTO')
        .or('Status.is.null,Status.eq.ABERTO,Status.eq.EM ABERTO,Status.eq.VENCIDO')
        .is('STATUS_OVERRIDE', null)
        .range(from, from + step - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) {
        const validade = r.ORC_DATA_ORCAMENTO ? String(r.ORC_DATA_ORCAMENTO).split('T')[0] : null;
        if (validade && validade < hoje) continue; // vencido legítimo — não apaga
        candidatos.push(r.id);
      }
      if (data.length < step) break;
      from += step;
    }

    // 2. Calcula o conjunto a deletar = candidatos − idsAtivos
    const setAtivos = new Set(idsAtivos.map(ID_PREFIX));
    const aDeletar = candidatos.filter(id => !setAtivos.has(id));

    // 3. DELETE em lotes (limite prático de .in() ~1000)
    let deletados = 0;
    const batch = 500;
    for (let i = 0; i < aDeletar.length; i += batch) {
      const chunk = aDeletar.slice(i, i + batch);
      const { error, count } = await supabase
        .from('crm_orcamentos')
        .delete({ count: 'exact' })
        .in('id', chunk);
      if (error) {
        console.error(`Cleanup lote ${i}: ${error.message}`);
        continue;
      }
      deletados += count || 0;
    }

    const msg = `Cleanup OK: ${deletados} fantasmas removidos. Candidatos avaliados: ${candidatos.length}. Ativos no ERP: ${idsAtivos.length}.`;
    console.log(msg);

    return NextResponse.json({
      success: true,
      message: msg,
      candidatos: candidatos.length,
      ativos: idsAtivos.length,
      deletados,
    });
  } catch (error: any) {
    console.error('ERRO cleanup:', error.message || error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
