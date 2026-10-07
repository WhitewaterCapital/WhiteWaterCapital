-- Club store: proposals, votes, decision journal, watchlist.
--
-- SECURITY MODEL. The site only has the public (anon) Supabase key, which
-- anyone can read out of the browser bundle. These tables hold the club's
-- actual tickers, so:
--   * RLS is ON with NO policies -> anon/authenticated can't touch the tables.
--   * All access goes through SECURITY DEFINER functions that first check a
--     server-only secret (CLUB_API_SECRET, never shipped to the browser)
--     against its SHA-256 hash in club_config.
-- Set the hash once after applying (see docs/CLUB_STORE.md):
--   insert into public.club_config(key, value)
--   values ('api_secret_sha256', '<hex sha256 of CLUB_API_SECRET>')
--   on conflict (key) do update set value = excluded.value;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.club_config (
  key   text primary key,
  value text not null
);

create table if not exists public.club_proposals (
  id            uuid primary key default gen_random_uuid(),
  symbol        text not null check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  side          text not null check (side in ('buy', 'sell')),
  target_amount numeric not null check (target_amount > 0),
  currency      text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  thesis        text not null check (length(thesis) between 10 and 4000),
  proposed_by   text not null check (length(proposed_by) between 1 and 60),
  status        text not null default 'open' check (status in ('open', 'approved', 'rejected', 'executed')),
  created_at    timestamptz not null default now()
);

create table if not exists public.club_votes (
  proposal_id uuid not null references public.club_proposals(id) on delete cascade,
  voter       text not null check (length(voter) between 1 and 60),
  value       text not null check (value in ('yes', 'no')),
  at          timestamptz not null default now(),
  primary key (proposal_id, voter)
);

create table if not exists public.club_journal (
  id         uuid primary key default gen_random_uuid(),
  symbol     text not null check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  action     text not null check (action in ('buy', 'add', 'trim', 'sell')),
  reasoning  text not null check (length(reasoning) between 10 and 4000),
  outcome    text check (outcome is null or length(outcome) <= 4000),
  author     text not null check (length(author) between 1 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.club_watchlist (
  symbol     text primary key check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  note       text not null default '' check (length(note) <= 1000),
  added_by   text not null check (length(added_by) between 1 and 60),
  created_at timestamptz not null default now()
);

alter table public.club_config    enable row level security;
alter table public.club_proposals enable row level security;
alter table public.club_votes     enable row level security;
alter table public.club_journal   enable row level security;
alter table public.club_watchlist enable row level security;
-- (No policies on purpose: direct table access is denied to every API role.)

-- ── the secret gate ─────────────────────────────────────────────────────────
create or replace function public._club_check(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected text;
begin
  select value into expected from public.club_config where key = 'api_secret_sha256';
  if expected is null or p_secret is null
     or encode(extensions.digest(p_secret, 'sha256'), 'hex') <> expected then
    raise exception 'not authorised' using errcode = '42501';
  end if;
end;
$$;

-- ── read everything the members pages need, in one call ─────────────────────
create or replace function public.club_read(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._club_check(p_secret);
  return jsonb_build_object(
    'proposals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'symbol', p.symbol, 'side', p.side,
        'target_amount', p.target_amount, 'currency', p.currency,
        'thesis', p.thesis, 'proposed_by', p.proposed_by, 'status', p.status,
        'created_at', p.created_at,
        'votes', coalesce((
          select jsonb_agg(jsonb_build_object('voter', v.voter, 'value', v.value, 'at', v.at) order by v.at)
          from public.club_votes v where v.proposal_id = p.id), '[]'::jsonb)
      ) order by p.created_at desc)
      from public.club_proposals p), '[]'::jsonb),
    'journal', coalesce((
      select jsonb_agg(to_jsonb(j) order by j.created_at desc) from public.club_journal j), '[]'::jsonb),
    'watchlist', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.created_at desc) from public.club_watchlist w), '[]'::jsonb)
  );
end;
$$;

create or replace function public.club_proposal_create(
  p_secret text, p_symbol text, p_side text, p_amount numeric,
  p_currency text, p_thesis text, p_author text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform public._club_check(p_secret);
  insert into public.club_proposals(symbol, side, target_amount, currency, thesis, proposed_by)
  values (upper(trim(p_symbol)), p_side, p_amount, upper(coalesce(p_currency, 'EUR')), trim(p_thesis), trim(p_author))
  returning id into new_id;
  return new_id;
end;
$$;

-- Cast or change a vote. Returns the proposal's status after the vote:
-- auto-approves at a strict majority of p_members yes votes, auto-rejects
-- when a majority can no longer be reached.
create or replace function public.club_vote(
  p_secret text, p_proposal uuid, p_voter text, p_value text, p_members int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  yes_n int;
  no_n int;
  need int := floor(greatest(p_members, 1) / 2.0)::int + 1;
  st text;
begin
  perform public._club_check(p_secret);
  select status into st from public.club_proposals where id = p_proposal;
  if st is null then raise exception 'no such proposal'; end if;
  if st <> 'open' then return st; end if;
  insert into public.club_votes(proposal_id, voter, value)
  values (p_proposal, trim(p_voter), p_value)
  on conflict (proposal_id, voter) do update set value = excluded.value, at = now();
  select count(*) filter (where value = 'yes'), count(*) filter (where value = 'no')
    into yes_n, no_n from public.club_votes where proposal_id = p_proposal;
  if yes_n >= need then
    update public.club_proposals set status = 'approved' where id = p_proposal;
    return 'approved';
  elsif no_n > p_members - need then
    update public.club_proposals set status = 'rejected' where id = p_proposal;
    return 'rejected';
  end if;
  return 'open';
end;
$$;

create or replace function public.club_proposal_set_status(p_secret text, p_proposal uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._club_check(p_secret);
  update public.club_proposals set status = p_status where id = p_proposal;
end;
$$;

create or replace function public.club_journal_add(
  p_secret text, p_symbol text, p_action text, p_reasoning text, p_author text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform public._club_check(p_secret);
  insert into public.club_journal(symbol, action, reasoning, author)
  values (upper(trim(p_symbol)), p_action, trim(p_reasoning), trim(p_author))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.club_journal_set_outcome(p_secret text, p_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._club_check(p_secret);
  update public.club_journal set outcome = nullif(trim(p_outcome), '') where id = p_id;
end;
$$;

create or replace function public.club_watch_add(p_secret text, p_symbol text, p_note text, p_author text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._club_check(p_secret);
  insert into public.club_watchlist(symbol, note, added_by)
  values (upper(trim(p_symbol)), coalesce(trim(p_note), ''), trim(p_author))
  on conflict (symbol) do update set note = excluded.note;
end;
$$;

create or replace function public.club_watch_remove(p_secret text, p_symbol text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._club_check(p_secret);
  delete from public.club_watchlist where symbol = upper(trim(p_symbol));
end;
$$;

-- Only the API roles may call the public functions; the check helper is internal.
revoke all on function public._club_check(text) from public, anon, authenticated;
grant execute on function
  public.club_read(text),
  public.club_proposal_create(text, text, text, numeric, text, text, text),
  public.club_vote(text, uuid, text, text, int),
  public.club_proposal_set_status(text, uuid, text),
  public.club_journal_add(text, text, text, text, text),
  public.club_journal_set_outcome(text, uuid, text),
  public.club_watch_add(text, text, text, text),
  public.club_watch_remove(text, text)
to anon, authenticated;
