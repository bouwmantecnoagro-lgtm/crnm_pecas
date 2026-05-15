-- =====================================================================
-- CRM Peças — Fila de aprovação de usuários (Opção B)
-- =====================================================================
-- Rodar UMA VEZ no SQL Editor do Supabase, APÓS o deploy do código que
-- checa role=PENDING na callback de login.
--
-- O que muda:
--   1. Aceita 'PENDING' como role válida
--   2. Trigger passa a criar novos usuários como PENDING
--      (exceto fabiano.luz que continua nascendo ADMIN)
--   3. Usuários existentes (USER/ADMIN) permanecem intactos
-- =====================================================================

-- 1. Atualizar o check constraint pra aceitar PENDING
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('ADMIN', 'USER', 'PENDING'));

-- 2. Atualizar trigger: novos usuários nascem PENDING (exceto admin seed)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    case
      when lower(new.email) = 'fabiano.luz@bouwman.com.br' then 'ADMIN'
      else 'PENDING'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- =====================================================================
-- Verificação
-- =====================================================================
-- select email, role from public.profiles order by created_at;
