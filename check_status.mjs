// Verifica a distribuição da coluna Status na tabela crm_orcamentos.
// Uso: node check_status.mjs
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Consultando crm_orcamentos no Supabase…\n');

const { count: total, error: e1 } = await supabase
  .from('crm_orcamentos')
  .select('*', { count: 'exact', head: true });
if (e1) { console.error('Erro contando total:', e1.message); process.exit(1); }

console.log(`Total de orçamentos no banco: ${total}\n`);

// Supabase JS não tem GROUP BY direto — vamos baixar só a coluna Status em lotes
// e contar localmente. Como é UMA coluna, mesmo 150k é leve.
const step = 1000;
const counts = new Map();
let nullCount = 0;
let lidos = 0;

for (let from = 0; from < total; from += step) {
  const { data, error } = await supabase
    .from('crm_orcamentos')
    .select('Status')
    .range(from, from + step - 1);
  if (error) { console.error('Erro lendo lote:', error.message); process.exit(1); }
  for (const row of data) {
    const s = row.Status;
    if (s === null || s === undefined || s === '') {
      nullCount++;
    } else {
      counts.set(s, (counts.get(s) || 0) + 1);
    }
  }
  lidos += data.length;
  process.stdout.write(`  ${lidos}/${total}\r`);
}

console.log('\n\n=== Distribuição da coluna Status ===');
console.log(`NULL/vazio:  ${nullCount.toLocaleString('pt-BR')}`);
for (const [status, qtd] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${status.padEnd(20)} ${qtd.toLocaleString('pt-BR')}`);
}

// Mostrar também o updated_at do registro mais recente para sabermos se houve sync após a mudança
const { data: ultRow } = await supabase
  .from('crm_orcamentos')
  .select('updated_at, Status, ORC_NUMERO_ORCAMENTO')
  .order('updated_at', { ascending: false, nullsFirst: false })
  .limit(1);
if (ultRow && ultRow[0]) {
  console.log(`\nRegistro mais recente atualizado em: ${ultRow[0].updated_at}`);
  console.log(`  Orçamento ${ultRow[0].ORC_NUMERO_ORCAMENTO} • Status: ${ultRow[0].Status ?? 'NULL'}`);
}
