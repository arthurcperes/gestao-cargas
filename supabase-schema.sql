-- Gestão de Cargas — schema inicial para Supabase
--
-- Como aplicar:
--   1. Crie um projeto Supabase novo (ou faça backup completo antes de usar um existente).
--   2. Execute este arquivo no SQL Editor ou como migration do Supabase CLI.
--   3. Configure somente a URL do projeto e a chave *publishable* no navegador.
--      Nunca coloque uma chave secret/service_role no index.html, script.js ou repositório.
--
-- O modelo é deliberadamente por usuário: cada registro pertence ao usuário autenticado
-- (user_id = auth.uid()). As políticas RLS impedem que um usuário leia ou altere dados
-- de outro, mesmo que descubra um UUID.
--
-- Importante sobre a "caderneta": viagens guardam os valores combinados. Pagamentos
-- são a única fonte de verdade dos valores efetivamente recebidos/pagos. A view
-- public.viagens_financeiro calcula saldo, adiantamentos, custos e margens sem gravar
-- totais duplicados na viagem.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Perfil mínimo ligado ao Supabase Auth
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Executada pelo trigger de auth.users. SECURITY DEFINER é necessário porque o
-- trigger nasce no schema auth; o search_path vazio evita resolução insegura de nomes.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuário'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_updated_at() from public;

-- -----------------------------------------------------------------------------
-- Dados operacionais
-- -----------------------------------------------------------------------------

create table if not exists public.caminhoes (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  placa_cavalo text not null default '',
  placa_carreta text,
  antt text,
  tipo_caminhao text,
  vencimento_documento date,
  observacoes text not null default '',
  -- Campos apenas para importação/auditoria. Novos registros devem mantê-los nulos.
  legacy_id text,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.cargas (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  empresa text not null default '',
  origem text not null default '',
  destino text not null default '',
  peso text,
  valor_frete numeric(14, 2) not null default 0 check (valor_frete >= 0),
  tipo_carga text,
  observacoes text not null default '',
  status text not null default 'aberta'
    check (status in ('aberta', 'reservada', 'finalizada', 'cancelada')),
  legacy_id text,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.motoristas (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null default '',
  telefone text,
  pix text,
  cnh text,
  mopp boolean not null default false,
  vencimento_cnh date,
  caminhao_habitual_id uuid,
  observacoes text not null default '',
  legacy_id text,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint motoristas_caminhao_habitual_fk
    foreign key (caminhao_habitual_id, user_id)
    references public.caminhoes (id, user_id)
    on update cascade on delete restrict
);

create table if not exists public.viagens (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  carga_id uuid not null,
  motorista_id uuid not null,
  caminhao_id uuid not null,
  -- São valores acordados/fotografados no momento da viagem, nunca totais calculados.
  valor_frete numeric(14, 2) not null default 0 check (valor_frete >= 0),
  valor_motorista numeric(14, 2) not null default 0 check (valor_motorista >= 0),
  status text not null default 'planejada'
    check (status in ('planejada', 'em_andamento', 'carregada', 'finalizada', 'cancelada')),
  observacoes text not null default '',
  legacy_id text,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint viagens_carga_mesmo_usuario_fk
    foreign key (carga_id, user_id)
    references public.cargas (id, user_id)
    on update cascade on delete restrict,
  constraint viagens_motorista_mesmo_usuario_fk
    foreign key (motorista_id, user_id)
    references public.motoristas (id, user_id)
    on update cascade on delete restrict,
  constraint viagens_caminhao_mesmo_usuario_fk
    foreign key (caminhao_id, user_id)
    references public.caminhoes (id, user_id)
    on update cascade on delete restrict
);

create table if not exists public.pagamentos (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  viagem_id uuid not null,
  -- Tipos finitos permitem que o cálculo financeiro seja confiável.
  tipo text not null check (tipo in (
    'adiantamento_motorista',
    'saldo_motorista',
    'diaria',
    'ajudante',
    'ajuda_de_custo',
    'recebimento_cliente',
    'outro_custo'
  )),
  -- Indica quem fez/recebeu o movimento. O valor continua sendo contado uma única vez.
  fonte_pagamento text not null default 'caixa_proprio' check (fonte_pagamento in (
    'caixa_proprio',
    'transportadora_alexandre',
    'cliente',
    'outro',
    'legado_nao_informado'
  )),
  valor numeric(14, 2) not null check (valor >= 0),
  data_pagamento date not null default current_date,
  observacao text not null default '',
  referencia_externa text,
  -- Itens vindos do adiantamento antigo da viagem começam em conciliação: eles não
  -- alteram saldo até serem confirmados, evitando contar duas vezes o mesmo dinheiro.
  status text not null default 'confirmado'
    check (status in ('confirmado', 'pendente_conciliacao', 'cancelado')),
  tipo_original text,
  legacy_id text,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint pagamentos_viagem_mesmo_usuario_fk
    foreign key (viagem_id, user_id)
    references public.viagens (id, user_id)
    on update cascade on delete restrict
);

create table if not exists public.documentos (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null default 'Outro',
  entidade_tipo text check (entidade_tipo in ('motorista', 'caminhao', 'viagem', 'carga')),
  motorista_id uuid,
  caminhao_id uuid,
  viagem_id uuid,
  carga_id uuid,
  vencimento date,
  observacoes text not null default '',
  -- O bucket é privado; storage_path recebe, por exemplo,
  -- "<auth.uid()>/<documento-id>/arquivo.pdf".
  storage_bucket text not null default 'documentos-privados'
    check (storage_bucket = 'documentos-privados'),
  storage_path text,
  nome_arquivo text,
  content_type text,
  tamanho_bytes bigint check (tamanho_bytes is null or tamanho_bytes >= 0),
  sha256 text,
  -- Documentos antigos só tinham o nome do arquivo no localStorage e precisam de reenvio.
  arquivo_pendente_reenvio boolean not null default false,
  legado_relacionado text,
  legacy_id text,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint documentos_uma_relacao_check check (
    (entidade_tipo is null and num_nonnulls(motorista_id, caminhao_id, viagem_id, carga_id) = 0)
    or (entidade_tipo = 'motorista' and motorista_id is not null and num_nonnulls(motorista_id, caminhao_id, viagem_id, carga_id) = 1)
    or (entidade_tipo = 'caminhao' and caminhao_id is not null and num_nonnulls(motorista_id, caminhao_id, viagem_id, carga_id) = 1)
    or (entidade_tipo = 'viagem' and viagem_id is not null and num_nonnulls(motorista_id, caminhao_id, viagem_id, carga_id) = 1)
    or (entidade_tipo = 'carga' and carga_id is not null and num_nonnulls(motorista_id, caminhao_id, viagem_id, carga_id) = 1)
  ),
  constraint documentos_motorista_mesmo_usuario_fk
    foreign key (motorista_id, user_id)
    references public.motoristas (id, user_id)
    on update cascade on delete restrict,
  constraint documentos_caminhao_mesmo_usuario_fk
    foreign key (caminhao_id, user_id)
    references public.caminhoes (id, user_id)
    on update cascade on delete restrict,
  constraint documentos_viagem_mesmo_usuario_fk
    foreign key (viagem_id, user_id)
    references public.viagens (id, user_id)
    on update cascade on delete restrict,
  constraint documentos_carga_mesmo_usuario_fk
    foreign key (carga_id, user_id)
    references public.cargas (id, user_id)
    on update cascade on delete restrict
);

-- -----------------------------------------------------------------------------
-- Auditoria de migração do localStorage
-- O payload bruto e legacy_id preservam campos que ainda não tenham equivalente no
-- novo modelo. Não apague o localStorage até validar contagens e dados importados.
-- -----------------------------------------------------------------------------

create table if not exists public.importacoes_legado (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  origem text not null default 'localStorage',
  schema_version integer not null default 1,
  checksum text not null,
  source_payload jsonb not null,
  resumo jsonb not null default '{}'::jsonb,
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'concluida')),
  created_at timestamptz not null default now(),
  ultima_tentativa_em timestamptz not null default now(),
  concluida_em timestamptz,
  unique (user_id, checksum)
);

-- Ponte de transição: o frontend pode salvar aqui o snapshot inteiro que hoje vive
-- no localStorage. É uma linha por usuário e permite dual-write enquanto cada tela é
-- convertida para as tabelas relacionais. Não substitui o modelo relacional a longo
-- prazo; serve para não perder alterações durante a migração gradual.
create table if not exists public.estado_app (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1 check (schema_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estado_app_payload_objeto_check check (jsonb_typeof(payload) = 'object')
);

-- legacy_id é o id textual atual (por exemplo, "id_171..."), não o UUID novo.
-- Índices parciais permitem idempotência sem obrigar registros novos a terem legacy_id.
create unique index if not exists caminhoes_user_legacy_id_key
  on public.caminhoes (user_id, legacy_id) where legacy_id is not null;
create unique index if not exists cargas_user_legacy_id_key
  on public.cargas (user_id, legacy_id) where legacy_id is not null;
create unique index if not exists motoristas_user_legacy_id_key
  on public.motoristas (user_id, legacy_id) where legacy_id is not null;
create unique index if not exists viagens_user_legacy_id_key
  on public.viagens (user_id, legacy_id) where legacy_id is not null;
create unique index if not exists pagamentos_user_legacy_id_key
  on public.pagamentos (user_id, legacy_id) where legacy_id is not null;
create unique index if not exists documentos_user_legacy_id_key
  on public.documentos (user_id, legacy_id) where legacy_id is not null;

create index if not exists cargas_user_status_idx on public.cargas (user_id, status, created_at desc);
create index if not exists motoristas_user_nome_idx on public.motoristas (user_id, nome);
create index if not exists caminhoes_user_placa_idx on public.caminhoes (user_id, placa_cavalo);
create index if not exists viagens_user_status_idx on public.viagens (user_id, status, created_at desc);
create index if not exists pagamentos_viagem_data_idx on public.pagamentos (viagem_id, data_pagamento desc);
create index if not exists documentos_user_vencimento_idx on public.documentos (user_id, vencimento);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
  for each row execute procedure public.touch_updated_at();
drop trigger if exists set_caminhoes_updated_at on public.caminhoes;
create trigger set_caminhoes_updated_at before update on public.caminhoes
  for each row execute procedure public.touch_updated_at();
drop trigger if exists set_cargas_updated_at on public.cargas;
create trigger set_cargas_updated_at before update on public.cargas
  for each row execute procedure public.touch_updated_at();
drop trigger if exists set_motoristas_updated_at on public.motoristas;
create trigger set_motoristas_updated_at before update on public.motoristas
  for each row execute procedure public.touch_updated_at();
drop trigger if exists set_viagens_updated_at on public.viagens;
create trigger set_viagens_updated_at before update on public.viagens
  for each row execute procedure public.touch_updated_at();
drop trigger if exists set_pagamentos_updated_at on public.pagamentos;
create trigger set_pagamentos_updated_at before update on public.pagamentos
  for each row execute procedure public.touch_updated_at();
drop trigger if exists set_documentos_updated_at on public.documentos;
create trigger set_documentos_updated_at before update on public.documentos
  for each row execute procedure public.touch_updated_at();
drop trigger if exists set_estado_app_updated_at on public.estado_app;
create trigger set_estado_app_updated_at before update on public.estado_app
  for each row execute procedure public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS: navegador só acessa linhas cujo user_id é o usuário da sessão atual.
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.caminhoes enable row level security;
alter table public.cargas enable row level security;
alter table public.motoristas enable row level security;
alter table public.viagens enable row level security;
alter table public.pagamentos enable row level security;
alter table public.documentos enable row level security;
alter table public.importacoes_legado enable row level security;
alter table public.estado_app enable row level security;

drop policy if exists profiles_do_proprio_usuario on public.profiles;
create policy profiles_do_proprio_usuario on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists caminhoes_do_proprio_usuario on public.caminhoes;
create policy caminhoes_do_proprio_usuario on public.caminhoes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists cargas_do_proprio_usuario on public.cargas;
create policy cargas_do_proprio_usuario on public.cargas
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists motoristas_do_proprio_usuario on public.motoristas;
create policy motoristas_do_proprio_usuario on public.motoristas
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists viagens_do_proprio_usuario on public.viagens;
create policy viagens_do_proprio_usuario on public.viagens
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists pagamentos_do_proprio_usuario on public.pagamentos;
create policy pagamentos_do_proprio_usuario on public.pagamentos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists documentos_do_proprio_usuario on public.documentos;
create policy documentos_do_proprio_usuario on public.documentos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists importacoes_legado_do_proprio_usuario on public.importacoes_legado;
create policy importacoes_legado_do_proprio_usuario on public.importacoes_legado
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists estado_app_do_proprio_usuario on public.estado_app;
create policy estado_app_do_proprio_usuario on public.estado_app
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.profiles, public.caminhoes, public.cargas,
  public.motoristas, public.viagens, public.pagamentos, public.documentos,
  public.importacoes_legado, public.estado_app from anon;
grant select, insert, update, delete on table public.profiles, public.caminhoes,
  public.cargas, public.motoristas, public.viagens, public.pagamentos,
  public.documentos, public.importacoes_legado, public.estado_app to authenticated;

-- -----------------------------------------------------------------------------
-- Storage privado para anexos reais
-- Não há URL pública de documento: o frontend deve usar createSignedUrl para abrir
-- e upload/remove/list com caminho iniciado pelo UUID do usuário autenticado.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-privados',
  'documentos-privados',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists documentos_privados_leitura_propria on storage.objects;
create policy documentos_privados_leitura_propria on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos-privados'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists documentos_privados_insercao_propria on storage.objects;
create policy documentos_privados_insercao_propria on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos-privados'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists documentos_privados_atualizacao_propria on storage.objects;
create policy documentos_privados_atualizacao_propria on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documentos-privados'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'documentos-privados'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists documentos_privados_exclusao_propria on storage.objects;
create policy documentos_privados_exclusao_propria on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documentos-privados'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- -----------------------------------------------------------------------------
-- View financeira: nenhum saldo/lucro derivado é salvo em viagens.
-- security_invoker mantém a RLS das tabelas de base também para a view.
-- -----------------------------------------------------------------------------

create or replace view public.viagens_financeiro
with (security_invoker = true)
as
select
  v.*,
  f.adiantamento_motorista,
  f.saldo_motorista_pago,
  f.total_pago_motorista,
  f.diarias,
  f.ajudantes,
  f.ajuda_de_custo,
  f.outros_custos,
  f.custos_adicionais,
  f.recebido_cliente,
  greatest(v.valor_motorista - f.total_pago_motorista, 0)::numeric(14, 2) as saldo_motorista_pendente,
  greatest(f.total_pago_motorista - v.valor_motorista, 0)::numeric(14, 2) as pagamento_motorista_excedente,
  greatest(v.valor_frete - f.recebido_cliente, 0)::numeric(14, 2) as recebimento_cliente_pendente,
  (v.valor_frete - v.valor_motorista - f.custos_adicionais)::numeric(14, 2) as margem_estimada,
  (f.recebido_cliente - f.total_pago_motorista - f.custos_adicionais)::numeric(14, 2) as resultado_caixa_registrado,
  (greatest(v.valor_motorista - f.total_pago_motorista, 0) > 0) as tem_saldo_motorista_pendente,
  (greatest(v.valor_frete - f.recebido_cliente, 0) > 0) as tem_recebimento_cliente_pendente
from public.viagens v
cross join lateral (
  select
    coalesce(sum(p.valor) filter (where p.tipo = 'adiantamento_motorista'), 0)::numeric(14, 2) as adiantamento_motorista,
    coalesce(sum(p.valor) filter (where p.tipo = 'saldo_motorista'), 0)::numeric(14, 2) as saldo_motorista_pago,
    coalesce(sum(p.valor) filter (where p.tipo in ('adiantamento_motorista', 'saldo_motorista')), 0)::numeric(14, 2) as total_pago_motorista,
    coalesce(sum(p.valor) filter (where p.tipo = 'diaria'), 0)::numeric(14, 2) as diarias,
    coalesce(sum(p.valor) filter (where p.tipo = 'ajudante'), 0)::numeric(14, 2) as ajudantes,
    coalesce(sum(p.valor) filter (where p.tipo = 'ajuda_de_custo'), 0)::numeric(14, 2) as ajuda_de_custo,
    coalesce(sum(p.valor) filter (where p.tipo = 'outro_custo'), 0)::numeric(14, 2) as outros_custos,
    coalesce(sum(p.valor) filter (where p.tipo in ('diaria', 'ajudante', 'ajuda_de_custo', 'outro_custo')), 0)::numeric(14, 2) as custos_adicionais,
    coalesce(sum(p.valor) filter (where p.tipo = 'recebimento_cliente'), 0)::numeric(14, 2) as recebido_cliente
  from public.pagamentos p
  where p.viagem_id = v.id
    and p.user_id = v.user_id
    and p.status = 'confirmado'
) f;

revoke all on table public.viagens_financeiro from anon;
grant select on table public.viagens_financeiro to authenticated;

-- -----------------------------------------------------------------------------
-- Migração transacional e idempotente do localStorage atual.
--
-- Contrato da RPC:
--   supabase.rpc('importar_snapshot_localstorage', {
--     p_payload: {
--       version: 1,
--       cargas: JSON.parse(localStorage.getItem('gc_cargas') || '[]'),
--       motoristas: JSON.parse(localStorage.getItem('gc_motoristas') || '[]'),
--       caminhoes: JSON.parse(localStorage.getItem('gc_caminhoes') || '[]'),
--       viagens: JSON.parse(localStorage.getItem('gc_viagens') || '[]'),
--       pagamentos: JSON.parse(localStorage.getItem('gc_pagamentos') || '[]'),
--       documentos: JSON.parse(localStorage.getItem('gc_documentos') || '[]')
--     }
--   })
--
-- A função ignora qualquer user_id recebido e usa auth.uid(). Ela é transacional:
-- ou todos os registros válidos entram, ou nenhum entra. Repetir exatamente o mesmo
-- snapshot é seguro graças ao checksum; snapshots diferentes nunca sobrescrevem uma
-- alteração já feita na nuvem. O payload e os legacy_id permanecem como trilha de
-- auditoria. Só remova os dados locais depois de conferir o resumo retornado.
-- -----------------------------------------------------------------------------

create or replace function public.legacy_money(p_value jsonb)
returns numeric
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_text text;
begin
  if p_value is null or p_value = 'null'::jsonb then
    return 0;
  end if;

  if pg_catalog.jsonb_typeof(p_value) = 'number' then
    return (p_value #>> '{}')::numeric;
  end if;

  v_text := pg_catalog.regexp_replace(p_value #>> '{}', '[^0-9,.-]', '', 'g');
  if position(',' in v_text) > 0 then
    v_text := replace(replace(v_text, '.', ''), ',', '.');
  end if;

  return coalesce(nullif(v_text, '')::numeric, 0);
exception
  when invalid_text_representation then return 0;
end;
$$;

create or replace function public.legacy_date(p_value text)
returns date
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if nullif(btrim(p_value), '') is null then
    return null;
  end if;

  if p_value ~ '^\d{4}-\d{2}-\d{2}$' then
    return p_value::date;
  end if;

  return (p_value::timestamptz at time zone 'America/Sao_Paulo')::date;
exception
  when others then return null;
end;
$$;

create or replace function public.legacy_timestamp(p_value text)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if nullif(btrim(p_value), '') is null then
    return null;
  end if;

  return p_value::timestamptz;
exception
  when others then return null;
end;
$$;

create or replace function public.legacy_id_or_hash(p_row jsonb)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(p_row ->> 'id'), ''),
    'sem-id:' || pg_catalog.md5(p_row::text)
  );
$$;

create or replace function public.importar_snapshot_localstorage(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_checksum text;
  v_import_id uuid;
  v_import_status text;
  v_item jsonb;
  v_key text;
  v_legacy_id text;
  v_carga_id uuid;
  v_motorista_id uuid;
  v_caminhao_id uuid;
  v_viagem_id uuid;
  v_carga_frete numeric(14, 2);
  v_valor_frete numeric(14, 2);
  v_tipo_pagamento text;
  v_adiantamento numeric(14, 2);
  v_cargas integer := 0;
  v_motoristas integer := 0;
  v_caminhoes integer := 0;
  v_viagens integer := 0;
  v_pagamentos integer := 0;
  v_documentos integer := 0;
  v_adiantamentos_pendentes integer := 0;
  v_adiantamentos_ja_lancados integer := 0;
  v_resumo jsonb;
begin
  if v_user_id is null then
    raise exception 'É necessário estar autenticado para importar dados.';
  end if;

  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'O snapshot da migração deve ser um objeto JSON.';
  end if;

  foreach v_key in array array['cargas', 'motoristas', 'caminhoes', 'viagens', 'pagamentos', 'documentos'] loop
    if p_payload ? v_key and pg_catalog.jsonb_typeof(p_payload -> v_key) <> 'array' then
      raise exception 'A coleção "%" deve ser uma lista.', v_key;
    end if;
  end loop;

  v_checksum := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.importacoes_legado (user_id, schema_version, checksum, source_payload)
  values (
    v_user_id,
    case
      when coalesce(p_payload ->> 'version', '') ~ '^\d+$' then (p_payload ->> 'version')::integer
      else 1
    end,
    v_checksum,
    p_payload
  )
  on conflict (user_id, checksum) do update
    set ultima_tentativa_em = now()
  returning id, status into v_import_id, v_import_status;

  if v_import_status = 'concluida' then
    select resumo into v_resumo
    from public.importacoes_legado
    where id = v_import_id and user_id = v_user_id;

    return jsonb_build_object(
      'importacaoId', v_import_id,
      'checksum', v_checksum,
      'jaImportado', true,
      'resumo', coalesce(v_resumo, '{}'::jsonb)
    );
  end if;

  -- 1. Caminhões: não dependem de outros registros.
  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'caminhoes', '[]'::jsonb)) loop
    v_legacy_id := public.legacy_id_or_hash(v_item);
    insert into public.caminhoes (
      user_id, placa_cavalo, placa_carreta, antt, tipo_caminhao,
      vencimento_documento, observacoes, legacy_id, legacy_payload, created_at, updated_at
    ) values (
      v_user_id,
      coalesce(v_item ->> 'placaCavalo', ''),
      nullif(v_item ->> 'placaCarreta', ''),
      nullif(v_item ->> 'antt', ''),
      nullif(v_item ->> 'tipoCaminhao', ''),
      public.legacy_date(v_item ->> 'vencimentoDocumento'),
      coalesce(v_item ->> 'observacoes', v_item ->> 'observacao', ''),
      v_legacy_id,
      v_item,
      coalesce(public.legacy_timestamp(v_item ->> 'createdAt'), now()),
      coalesce(public.legacy_timestamp(v_item ->> 'updatedAt'), now())
    ) on conflict do nothing;
    if found then v_caminhoes := v_caminhoes + 1; end if;
  end loop;

  -- 2. Cargas: não dependem de outros registros.
  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'cargas', '[]'::jsonb)) loop
    v_legacy_id := public.legacy_id_or_hash(v_item);
    insert into public.cargas (
      user_id, empresa, origem, destino, peso, valor_frete, tipo_carga,
      observacoes, status, legacy_id, legacy_payload, created_at, updated_at
    ) values (
      v_user_id,
      coalesce(v_item ->> 'empresa', ''),
      coalesce(v_item ->> 'origem', ''),
      coalesce(v_item ->> 'destino', ''),
      nullif(v_item ->> 'peso', ''),
      public.legacy_money(v_item -> 'valorFrete'),
      nullif(v_item ->> 'tipoCarga', ''),
      coalesce(v_item ->> 'observacoes', v_item ->> 'observacao', ''),
      case pg_catalog.lower(coalesce(v_item ->> 'status', 'aberta'))
        when 'reservada' then 'reservada'
        when 'finalizada' then 'finalizada'
        when 'cancelada' then 'cancelada'
        else 'aberta'
      end,
      v_legacy_id,
      v_item,
      coalesce(public.legacy_timestamp(v_item ->> 'createdAt'), now()),
      coalesce(public.legacy_timestamp(v_item ->> 'updatedAt'), now())
    ) on conflict do nothing;
    if found then v_cargas := v_cargas + 1; end if;
  end loop;

  -- 3. Motoristas: o caminhão habitual é opcional; um vínculo ausente não bloqueia dados.
  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'motoristas', '[]'::jsonb)) loop
    v_legacy_id := public.legacy_id_or_hash(v_item);
    select id into v_caminhao_id
    from public.caminhoes
    where user_id = v_user_id
      and legacy_id = nullif(coalesce(v_item ->> 'truckId', v_item ->> 'caminhaoId'), '')
    limit 1;

    insert into public.motoristas (
      user_id, nome, telefone, pix, cnh, mopp, vencimento_cnh,
      caminhao_habitual_id, observacoes, legacy_id, legacy_payload, created_at, updated_at
    ) values (
      v_user_id,
      coalesce(v_item ->> 'nome', ''),
      nullif(v_item ->> 'telefone', ''),
      nullif(v_item ->> 'pix', ''),
      nullif(v_item ->> 'cnh', ''),
      pg_catalog.lower(coalesce(v_item ->> 'mopp', 'nao')) in ('sim', 'true', '1'),
      public.legacy_date(v_item ->> 'vencimentoCnh'),
      v_caminhao_id,
      coalesce(v_item ->> 'observacoes', v_item ->> 'observacao', ''),
      v_legacy_id,
      v_item,
      coalesce(public.legacy_timestamp(v_item ->> 'createdAt'), now()),
      coalesce(public.legacy_timestamp(v_item ->> 'updatedAt'), now())
    ) on conflict do nothing;
    if found then v_motoristas := v_motoristas + 1; end if;
  end loop;

  -- 4. Viagens: relações obrigatórias são verificadas antes da inserção.
  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'viagens', '[]'::jsonb)) loop
    v_legacy_id := public.legacy_id_or_hash(v_item);

    select id, valor_frete into v_carga_id, v_carga_frete
    from public.cargas
    where user_id = v_user_id and legacy_id = nullif(v_item ->> 'cargaId', '')
    limit 1;
    select id into v_motorista_id
    from public.motoristas
    where user_id = v_user_id and legacy_id = nullif(v_item ->> 'motoristaId', '')
    limit 1;
    select id into v_caminhao_id
    from public.caminhoes
    where user_id = v_user_id and legacy_id = nullif(v_item ->> 'caminhaoId', '')
    limit 1;

    if v_carga_id is null or v_motorista_id is null or v_caminhao_id is null then
      raise exception 'A viagem legada % possui carga, motorista ou caminhão inexistente.', v_legacy_id;
    end if;

    -- A presença do campo, mesmo com valor 0, prevalece sobre o frete da carga.
    v_valor_frete := case
      when v_item ? 'valorFrete' and v_item -> 'valorFrete' <> 'null'::jsonb
        then public.legacy_money(v_item -> 'valorFrete')
      else v_carga_frete
    end;

    insert into public.viagens (
      user_id, carga_id, motorista_id, caminhao_id, valor_frete, valor_motorista,
      status, observacoes, legacy_id, legacy_payload, created_at, updated_at
    ) values (
      v_user_id,
      v_carga_id,
      v_motorista_id,
      v_caminhao_id,
      v_valor_frete,
      public.legacy_money(v_item -> 'valorMotorista'),
      case pg_catalog.lower(coalesce(v_item ->> 'status', 'planejada'))
        when 'em andamento' then 'em_andamento'
        when 'em_andamento' then 'em_andamento'
        when 'carregada' then 'carregada'
        when 'finalizada' then 'finalizada'
        when 'cancelada' then 'cancelada'
        else 'planejada'
      end,
      coalesce(v_item ->> 'observacoes', v_item ->> 'observacao', ''),
      v_legacy_id,
      v_item,
      coalesce(public.legacy_timestamp(v_item ->> 'createdAt'), now()),
      coalesce(public.legacy_timestamp(v_item ->> 'updatedAt'), now())
    ) on conflict do nothing;
    if found then v_viagens := v_viagens + 1; end if;
  end loop;

  -- 5. Pagamentos já lançados no financeiro entram confirmados.
  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'pagamentos', '[]'::jsonb)) loop
    v_legacy_id := public.legacy_id_or_hash(v_item);
    select id into v_viagem_id
    from public.viagens
    where user_id = v_user_id and legacy_id = nullif(v_item ->> 'viagemId', '')
    limit 1;

    if v_viagem_id is null then
      raise exception 'O pagamento legado % aponta para uma viagem inexistente.', v_legacy_id;
    end if;

    v_tipo_pagamento := case pg_catalog.lower(coalesce(v_item ->> 'tipo', v_item ->> 'tipoPagamento', ''))
      when 'adiantamento' then 'adiantamento_motorista'
      when 'adiantamento motorista' then 'adiantamento_motorista'
      when 'saldo motorista' then 'saldo_motorista'
      when 'diária' then 'diaria'
      when 'diaria' then 'diaria'
      when 'ajudante' then 'ajudante'
      when 'ajuda de custo' then 'ajuda_de_custo'
      when 'recebimento cliente' then 'recebimento_cliente'
      else 'outro_custo'
    end;

    insert into public.pagamentos (
      user_id, viagem_id, tipo, fonte_pagamento, valor, data_pagamento, observacao,
      status, tipo_original, legacy_id, legacy_payload, created_at, updated_at
    ) values (
      v_user_id,
      v_viagem_id,
      v_tipo_pagamento,
      'legado_nao_informado',
      public.legacy_money(v_item -> 'valor'),
      coalesce(public.legacy_date(v_item ->> 'dataPagamento'), current_date),
      coalesce(v_item ->> 'observacao', v_item ->> 'observacoes', ''),
      'confirmado',
      coalesce(v_item ->> 'tipo', v_item ->> 'tipoPagamento', ''),
      v_legacy_id,
      v_item,
      coalesce(public.legacy_timestamp(v_item ->> 'createdAt'), now()),
      coalesce(public.legacy_timestamp(v_item ->> 'updatedAt'), now())
    ) on conflict do nothing;
    if found then v_pagamentos := v_pagamentos + 1; end if;
  end loop;

  -- 6. O antigo campo viagem.adiantamento não é uma segunda fonte de verdade.
  -- Se já houver pagamento de adiantamento igual, ele é considerado o mesmo evento.
  -- Caso contrário, preservamos o dado como pendente de conciliação e ele ainda não
  -- reduz o saldo até a confirmação consciente no novo sistema.
  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'viagens', '[]'::jsonb)) loop
    v_adiantamento := public.legacy_money(v_item -> 'adiantamento');
    if v_adiantamento <= 0 then
      continue;
    end if;

    v_legacy_id := public.legacy_id_or_hash(v_item);
    select id into v_viagem_id
    from public.viagens
    where user_id = v_user_id and legacy_id = v_legacy_id
    limit 1;

    if exists (
      select 1 from public.pagamentos p
      where p.user_id = v_user_id
        and p.viagem_id = v_viagem_id
        and p.tipo = 'adiantamento_motorista'
        and p.status = 'confirmado'
        and p.valor = v_adiantamento
    ) then
      v_adiantamentos_ja_lancados := v_adiantamentos_ja_lancados + 1;
    else
      insert into public.pagamentos (
        user_id, viagem_id, tipo, fonte_pagamento, valor, data_pagamento, observacao,
        status, tipo_original, legacy_id, legacy_payload
      ) values (
        v_user_id,
        v_viagem_id,
        'adiantamento_motorista',
        'legado_nao_informado',
        v_adiantamento,
        current_date,
        'Importado do campo adiantamento da viagem. Confirme antes de considerar no saldo.',
        'pendente_conciliacao',
        'adiantamento no cadastro da viagem',
        v_legacy_id || ':adiantamento-da-viagem',
        jsonb_build_object('viagemLegacyId', v_legacy_id, 'adiantamento', v_adiantamento)
      ) on conflict do nothing;
      if found then
        v_adiantamentos_pendentes := v_adiantamentos_pendentes + 1;
      end if;
    end if;
  end loop;

  -- 7. Arquivos nunca estiveram no localStorage; só o nome era salvo. Assim, o
  -- metadado é preservado e o sistema deixa explícito que o arquivo precisa ser reenviado.
  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'documentos', '[]'::jsonb)) loop
    v_legacy_id := public.legacy_id_or_hash(v_item);
    insert into public.documentos (
      user_id, tipo, vencimento, observacoes, nome_arquivo, arquivo_pendente_reenvio,
      legado_relacionado, legacy_id, legacy_payload, created_at, updated_at
    ) values (
      v_user_id,
      coalesce(v_item ->> 'tipo', v_item ->> 'tipoDocumento', 'Outro'),
      coalesce(
        public.legacy_date(v_item ->> 'vencimentoDocumentoSistema'),
        public.legacy_date(v_item ->> 'vencimentoDocumento'),
        public.legacy_date(v_item ->> 'vencimento')
      ),
      coalesce(v_item ->> 'observacoes', ''),
      nullif(v_item ->> 'fileName', ''),
      nullif(v_item ->> 'fileName', '') is not null,
      nullif(coalesce(v_item ->> 'relacionado', v_item ->> 'relacionadoDocumento'), ''),
      v_legacy_id,
      v_item,
      coalesce(public.legacy_timestamp(v_item ->> 'createdAt'), now()),
      coalesce(public.legacy_timestamp(v_item ->> 'updatedAt'), now())
    ) on conflict do nothing;
    if found then v_documentos := v_documentos + 1; end if;
  end loop;

  v_resumo := jsonb_build_object(
    'cargasInseridas', v_cargas,
    'motoristasInseridos', v_motoristas,
    'caminhoesInseridos', v_caminhoes,
    'viagensInseridas', v_viagens,
    'pagamentosInseridos', v_pagamentos,
    'documentosInseridos', v_documentos,
    'adiantamentosPendentesDeConciliacao', v_adiantamentos_pendentes,
    'adiantamentosJaRepresentadosPorPagamento', v_adiantamentos_ja_lancados
  );

  update public.importacoes_legado
  set status = 'concluida', resumo = v_resumo, concluida_em = now(), ultima_tentativa_em = now()
  where id = v_import_id and user_id = v_user_id;

  return jsonb_build_object(
    'importacaoId', v_import_id,
    'checksum', v_checksum,
    'jaImportado', false,
    'resumo', v_resumo
  );
end;
$$;

revoke all on function public.legacy_money(jsonb) from public, anon;
revoke all on function public.legacy_date(text) from public, anon;
revoke all on function public.legacy_timestamp(text) from public, anon;
revoke all on function public.legacy_id_or_hash(jsonb) from public, anon;
revoke all on function public.importar_snapshot_localstorage(jsonb) from public, anon;
-- As quatro auxiliares abaixo não acessam nenhuma tabela nem segredo; a RPC usa-as
-- com SECURITY INVOKER, portanto authenticated precisa poder executá-las.
grant execute on function public.legacy_money(jsonb) to authenticated;
grant execute on function public.legacy_date(text) to authenticated;
grant execute on function public.legacy_timestamp(text) to authenticated;
grant execute on function public.legacy_id_or_hash(jsonb) to authenticated;
grant execute on function public.importar_snapshot_localstorage(jsonb) to authenticated;

-- Após executar a migration, confirme no Dashboard:
--   * Authentication > Providers: configure e-mail/senha (ou o provedor escolhido).
--   * Authentication > URL Configuration: adicione a URL de produção e de desenvolvimento.
--   * Database > Advisors: execute os verificadores de segurança/RLS.
--   * Storage: o bucket "documentos-privados" deve continuar privado.
