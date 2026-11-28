-- LegisDot Comercial: fila privada. Nenhuma alteração em compras, alunos ou acessos.
begin;

create table public.legisdot_conversations (
  id uuid primary key default gen_random_uuid(),
  phone_number_id text not null,
  sender_key text not null,
  recipient_kind text not null check (recipient_kind in ('phone', 'bsuid')),
  recipient_value text not null,
  phone_alias text,
  display_name text,
  status text not null default 'bot' check (status in ('bot', 'human', 'opted_out')),
  paused_by_admin boolean not null default false,
  stage text not null default 'qualificacao',
  last_inbound_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone_number_id, sender_key)
);

create table public.legisdot_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.legisdot_conversations(id) on delete cascade,
  phone_number_id text not null,
  provider_message_id text not null,
  inbound_text text not null check (length(inbound_text) <= 8000),
  input_kind text not null check (input_kind in ('text', 'unsupported')),
  received_at timestamptz not null,
  mode text not null check (mode in ('shadow', 'live')),
  control_action text check (control_action in ('human', 'opt_out')),
  state text not null default 'pending' check (state in ('pending','processing','draft','ready','sending','accepted','failed','uncertain','ignored')),
  attempts integer not null default 0,
  retry_after timestamptz not null default now(),
  claim_token uuid,
  lease_until timestamptz,
  reply_text text,
  reply_stage text,
  engine text check (engine in ('ai', 'rules')),
  product_ids jsonb not null default '[]'::jsonb,
  planned_handoff boolean not null default false,
  planned_opt_out boolean not null default false,
  outbound_message_id text,
  send_started_at timestamptz,
  delivery_status text,
  delivery_rank integer not null default 0,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  unique(phone_number_id, provider_message_id)
);

create index legisdot_conversations_recent on public.legisdot_conversations(updated_at desc);
create unique index legisdot_conversations_phone_alias on public.legisdot_conversations(phone_number_id, phone_alias) where phone_alias is not null;
create index legisdot_messages_conversation on public.legisdot_messages(conversation_id, created_at desc);
create index legisdot_messages_queue on public.legisdot_messages(created_at) where state in ('pending','processing','ready','sending');
create index legisdot_messages_budget on public.legisdot_messages(phone_number_id, send_started_at) where send_started_at is not null;
create index legisdot_messages_outbound on public.legisdot_messages(phone_number_id, outbound_message_id) where outbound_message_id is not null;

create table public.legisdot_status_events (
  id bigint generated always as identity primary key,
  phone_number_id text not null,
  provider_message_id text not null,
  correlation_id uuid,
  status text not null check(status in ('sent','delivered','read','failed')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(phone_number_id, provider_message_id, status, occurred_at)
);

alter table public.legisdot_conversations enable row level security;
alter table public.legisdot_messages enable row level security;
alter table public.legisdot_status_events enable row level security;
revoke all on public.legisdot_conversations, public.legisdot_messages, public.legisdot_status_events from public, anon, authenticated;
grant select, insert, update, delete on public.legisdot_conversations, public.legisdot_messages, public.legisdot_status_events to service_role;
revoke all on sequence public.legisdot_status_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.legisdot_status_events_id_seq to service_role;

create function public.legisdot_receive_message(
  p_phone_number_id text, p_provider_message_id text, p_recipient_kind text,
  p_recipient_value text, p_display_name text, p_received_at timestamptz,
  p_kind text, p_text text, p_mode text, p_control text default null, p_phone_alias text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_conversation uuid; v_message uuid; v_latest timestamptz; v_phone text; other public.legisdot_conversations;
begin
  if p_received_at > now() + interval '1 minute' or p_received_at < '2000-01-01'::timestamptz
    or length(p_text) > 8000 or length(p_recipient_value) > 256
    or length(p_provider_message_id) > 512 or length(p_phone_number_id) > 64 then
    raise exception 'invalid message';
  end if;
  v_phone:=case when p_recipient_kind='phone' then p_recipient_value else p_phone_alias end;
  if v_phone is not null and v_phone !~ '^[1-9][0-9]{5,14}$' then raise exception 'invalid phone alias'; end if;
  -- Uma entrega que contém telefone e BSUID vincula as identidades com dados assinados da Meta.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('legisdot_identity:' || p_phone_number_id));
  select id into v_conversation from public.legisdot_conversations
    where phone_number_id=p_phone_number_id and (sender_key=p_recipient_kind || ':' || p_recipient_value or (v_phone is not null and phone_alias=v_phone))
    order by case when sender_key=p_recipient_kind || ':' || p_recipient_value then 0 else 1 end,id limit 1 for update;
  if v_conversation is null then
    insert into public.legisdot_conversations(phone_number_id,sender_key,recipient_kind,recipient_value,phone_alias,display_name,last_inbound_at)
      values(p_phone_number_id,p_recipient_kind || ':' || p_recipient_value,p_recipient_kind,p_recipient_value,v_phone,left(p_display_name,200),p_received_at)
      returning id,last_inbound_at into v_conversation,v_latest;
  else
    -- Se as duas identidades já existiam, une o histórico preservando a restrição mais forte.
    for other in select * from public.legisdot_conversations where phone_number_id=p_phone_number_id and id<>v_conversation
      and (sender_key=p_recipient_kind || ':' || p_recipient_value or (v_phone is not null and phone_alias=v_phone)) for update loop
      update public.legisdot_conversations set
        status=case when status='opted_out' or other.status='opted_out' then 'opted_out'
          when status='human' or other.status='human' then 'human' else 'bot' end,
        paused_by_admin=paused_by_admin or other.paused_by_admin,
        last_inbound_at=greatest(last_inbound_at,other.last_inbound_at)
        where id=v_conversation;
      update public.legisdot_messages set conversation_id=v_conversation where conversation_id=other.id;
      delete from public.legisdot_conversations where id=other.id;
    end loop;
    update public.legisdot_conversations set
      recipient_kind=case when p_recipient_kind='bsuid' then 'bsuid' else recipient_kind end,
      recipient_value=case when p_recipient_kind='bsuid' then p_recipient_value else recipient_value end,
      sender_key=case when p_recipient_kind='bsuid' then 'bsuid:' || p_recipient_value else sender_key end,
      phone_alias=coalesce(v_phone,phone_alias),last_inbound_at=greatest(last_inbound_at,p_received_at),
      display_name=coalesce(left(p_display_name,200),display_name)
      where id=v_conversation returning last_inbound_at into v_latest;
  end if;
  insert into public.legisdot_messages(conversation_id,phone_number_id,provider_message_id,inbound_text,input_kind,received_at,mode,control_action,state)
    values(v_conversation,p_phone_number_id,p_provider_message_id,p_text,p_kind,p_received_at,p_mode,p_control,
      case when p_received_at < v_latest then 'ignored' else 'pending' end)
    on conflict(phone_number_id,provider_message_id) do nothing returning id into v_message;
  if v_message is null then return false; end if;
  -- Cancelar contato prevalece inclusive em entrega fora de ordem.
  if p_control is not null then
    update public.legisdot_conversations set status=case when p_control='opt_out' then 'opted_out'
      when status<>'opted_out' then 'human' else status end,stage='humano',updated_at=now()
      where id=v_conversation;
  end if;
  -- Uma entrega atrasada não reabre a janela nem substitui a mensagem mais recente.
  if p_received_at >= v_latest then
    update public.legisdot_messages set state='ignored',error_code='superseded',updated_at=now()
      where conversation_id=v_conversation and id<>v_message and state='pending';
    update public.legisdot_conversations set
      status=case when p_control='opt_out' then 'opted_out'
        when p_control='human' and status<>'opted_out' then 'human' else status end,
      stage=case when p_control is not null then 'humano' else stage end,
      updated_at=now() where id=v_conversation;
  end if;
  return true;
end $$;

create function public.legisdot_claim_message(p_phone_number_id text) returns setof public.legisdot_messages
language plpgsql security invoker set search_path = '' as $$
declare v_conversation uuid; v_message uuid;
begin
  -- Um processo que morreu após iniciar POST não é reenviado automaticamente.
  update public.legisdot_messages set state='uncertain',error_code='send_lease_expired',updated_at=now()
    where phone_number_id=p_phone_number_id and state='sending' and lease_until < now();
  update public.legisdot_messages set state=case when attempts<3 then 'pending' else 'failed' end,
    error_code='processing_lease_expired',claim_token=null,lease_until=null,updated_at=now()
    where phone_number_id=p_phone_number_id and state in ('processing','ready') and lease_until < now();

  select c.id into v_conversation from public.legisdot_conversations c
    where c.phone_number_id=p_phone_number_id and exists(select 1 from public.legisdot_messages m where m.conversation_id=c.id and m.state='pending' and m.retry_after<=now())
      and not exists(select 1 from public.legisdot_messages m where m.conversation_id=c.id and m.state in ('processing','ready','sending'))
    order by c.updated_at asc for update of c skip locked limit 1;
  if v_conversation is null then return; end if;
  select id into v_message from public.legisdot_messages where conversation_id=v_conversation and state='pending' and retry_after<=now()
    order by created_at asc for update skip locked limit 1;
  return query update public.legisdot_messages set state='processing',claim_token=gen_random_uuid(),
    lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now()
    where id=v_message returning *;
end $$;

create function public.legisdot_save_reply(p_id uuid,p_token uuid,p_text text,p_stage text,p_engine text,p_products jsonb,p_handoff boolean,p_opt_out boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_row public.legisdot_messages; v_conversation uuid;
begin
  if length(p_text)>4096 or length(p_text)=0 then raise exception 'invalid reply'; end if;
  select conversation_id into v_conversation from public.legisdot_messages where id=p_id;
  -- Sempre conversa antes de mensagem, como na ingestão e no preparo do envio.
  perform 1 from public.legisdot_conversations where id=v_conversation for update;
  update public.legisdot_messages set reply_text=p_text,reply_stage=p_stage,engine=p_engine,product_ids=p_products,
    planned_handoff=p_handoff,planned_opt_out=p_opt_out,state=case when mode='shadow' then 'draft' else 'ready' end,updated_at=now()
    where id=p_id and claim_token=p_token and state='processing' and lease_until>now() returning * into v_row;
  if v_row.id is null then return false; end if;
  -- O rascunho não assume atendimento. Efeitos de handoff só no preparo de um envio atual.
  return true;
end $$;

create function public.legisdot_prepare_send(p_id uuid,p_token uuid,p_daily_limit integer)
returns text language plpgsql security invoker set search_path = '' as $$
declare m public.legisdot_messages; c public.legisdot_conversations; v_reason text;
begin
  select * into m from public.legisdot_messages where id=p_id;
  if m.id is null then return 'missing'; end if;
  select * into c from public.legisdot_conversations where id=m.conversation_id for update;
  select * into m from public.legisdot_messages where id=p_id for update;
  if m.state<>'ready' or m.claim_token is distinct from p_token or m.lease_until<=now() then return 'lease_lost'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('legisdot_budget:' || m.phone_number_id));
  if m.mode<>'live' then v_reason:='not_live';
  elsif c.last_inbound_at + interval '23 hours 59 minutes' <= now() then v_reason:='window_closed';
  elsif c.paused_by_admin then v_reason:='paused';
  elsif c.status='opted_out' and m.control_action is distinct from 'opt_out' then v_reason:='opted_out';
  elsif c.status='human' and m.control_action is distinct from 'human' and not m.planned_handoff then v_reason:='human';
  elsif exists(select 1 from public.legisdot_messages newer where newer.conversation_id=m.conversation_id
    and newer.created_at>m.created_at and newer.received_at>=m.received_at) then v_reason:='superseded';
  elsif (select count(*) from public.legisdot_messages b where b.phone_number_id=m.phone_number_id
    and b.send_started_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=greatest(1,least(p_daily_limit,10000)) then v_reason:='daily_limit';
  elsif (select count(*) from public.legisdot_messages b where b.conversation_id=m.conversation_id
    and b.send_started_at>now()-interval '1 hour')>=10 then v_reason:='contact_limit';
  end if;
  if v_reason is not null then
    update public.legisdot_messages set state='ignored',error_code=v_reason,updated_at=now() where id=p_id;
    return v_reason;
  end if;
  update public.legisdot_messages set state='sending',send_started_at=now(),lease_until=now()+interval '2 minutes',updated_at=now() where id=p_id;
  update public.legisdot_conversations set stage=coalesce(m.reply_stage,stage),
    status=case when m.planned_opt_out then 'opted_out' when m.planned_handoff and status='bot' then 'human' else status end,
    updated_at=now() where id=c.id;
  return 'send';
end $$;

create function public.legisdot_record_status(p_phone_number_id text,p_message_id text,p_correlation uuid,p_status text,p_at timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_rank integer;
begin
  v_rank:=case p_status when 'sent' then 1 when 'failed' then 2 when 'delivered' then 3 when 'read' then 4 else 0 end;
  if v_rank=0 then return; end if;
  insert into public.legisdot_status_events(phone_number_id,provider_message_id,correlation_id,status,occurred_at)
    values(p_phone_number_id,p_message_id,p_correlation,p_status,p_at) on conflict do nothing;
  update public.legisdot_messages set delivery_status=p_status,delivery_rank=v_rank,
    outbound_message_id=coalesce(outbound_message_id,p_message_id),
    state=case when p_status='failed' then 'failed' else 'accepted' end,
    updated_at=now()
    where phone_number_id=p_phone_number_id and send_started_at is not null
      and (id=p_correlation or outbound_message_id=p_message_id) and delivery_rank<v_rank;
end $$;

-- Funções invoker e sem EXECUTE público: apenas o backend autenticado as chama.
revoke all on function public.legisdot_receive_message(text,text,text,text,text,timestamptz,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.legisdot_claim_message(text) from public,anon,authenticated;
revoke all on function public.legisdot_save_reply(uuid,uuid,text,text,text,jsonb,boolean,boolean) from public,anon,authenticated;
revoke all on function public.legisdot_prepare_send(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.legisdot_record_status(text,text,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.legisdot_receive_message(text,text,text,text,text,timestamptz,text,text,text,text,text) to service_role;
grant execute on function public.legisdot_claim_message(text) to service_role;
grant execute on function public.legisdot_save_reply(uuid,uuid,text,text,text,jsonb,boolean,boolean) to service_role;
grant execute on function public.legisdot_prepare_send(uuid,uuid,integer) to service_role;
grant execute on function public.legisdot_record_status(text,text,uuid,text,timestamptz) to service_role;
commit;
