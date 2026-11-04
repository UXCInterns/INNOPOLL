-- ============================================================
-- INNOPOLL DATABASE SETUP AND MIGRATION
-- Existing sessions and responses are preserved.
-- Existing responses are migrated into completed participants.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Extend the existing sessions table
-- ------------------------------------------------------------

alter table public.sessions
add column if not exists start_date date
default ((now() at time zone 'Asia/Singapore')::date);

alter table public.sessions
add column if not exists end_date date
default (((now() at time zone 'Asia/Singapore')::date) + 7);

alter table public.sessions
add column if not exists room_code text;

-- Generate room codes for existing sessions that do not have one.
update public.sessions
set room_code = upper(
  substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)
)
where room_code is null;

create unique index if not exists sessions_room_code_unique
on public.sessions (room_code);

-- ------------------------------------------------------------
-- 2. Create the questions table
-- ------------------------------------------------------------

create table if not exists public.session_questions (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null
    references public.sessions(id) on delete cascade,

  category text not null,
  title text not null,
  question_text text not null,
  definition text not null default '',
  statements jsonb not null default '[]'::jsonb,

  sort_order integer not null default 1,
  is_default boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists session_questions_session_order_idx
on public.session_questions (session_id, sort_order);

create unique index if not exists session_questions_default_category_unique
on public.session_questions (session_id, category)
where is_default = true;

-- ------------------------------------------------------------
-- 3. Create the participants table
-- ------------------------------------------------------------

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null
    references public.sessions(id) on delete cascade,

  participant_code text not null,

  -- A hash of the anonymous browser token.
  -- Historical participants have no browser token.
  browser_token_hash text,

  started_at timestamptz not null default now(),
  completed_at timestamptz,

  -- Links a migrated participant to the original response.
  legacy_response_id uuid unique,

  created_at timestamptz not null default now(),

  constraint participants_session_code_unique
    unique (session_id, participant_code),

  constraint participants_session_browser_token_unique
    unique (session_id, browser_token_hash)
);

create index if not exists participants_session_idx
on public.participants (session_id);

create index if not exists participants_completion_idx
on public.participants (session_id, completed_at);

-- ------------------------------------------------------------
-- 4. Create the individual participant answers table
-- ------------------------------------------------------------

create table if not exists public.participant_answers (
  id uuid primary key default gen_random_uuid(),

  participant_id uuid not null
    references public.participants(id) on delete cascade,

  question_id uuid not null
    references public.session_questions(id) on delete cascade,

  score integer not null
    check (score >= 1 and score <= 5),

  answered_at timestamptz not null default now(),

  constraint participant_answers_one_per_question
    unique (participant_id, question_id)
);

create index if not exists participant_answers_participant_idx
on public.participant_answers (participant_id);

create index if not exists participant_answers_question_idx
on public.participant_answers (question_id);

-- ------------------------------------------------------------
-- 5. Add the three default questions to every existing session
-- ------------------------------------------------------------

insert into public.session_questions (
  session_id,
  category,
  title,
  question_text,
  definition,
  statements,
  sort_order,
  is_default
)
select
  s.id,
  q.category,
  q.title,
  q.question_text,
  q.definition,
  '[]'::jsonb,
  q.sort_order,
  true
from public.sessions s
cross join (
  values
  (
    'culture',
    'Innovation Culture',
    'Does your company embrace discussions on experimentation to generate and test new ideas, concepts, business models, etc. to innovate?',
    'An Innovation Culture fosters an atmosphere where employees feel empowered to take risks, collaborate, and continuously seek out opportunities for improvement and innovation in products, processes, or services. This is essential to staying competitive in today''s rapidly changing landscape.',
    1
  ),
  (
    'practices',
    'Innovation Practices',
    'How often does your company use business models, startup methodologies, design thinking or any other innovation tools and methods?',
    'Innovation Practices often involve fostering a culture of innovation, conducting research and development, leveraging on technology and tools and processes for collaboration to thrive in an ever changing environmental and economic uncertainty to achieve sustainable advancements for all users.',
    2
  ),
  (
    'leadership',
    'Innovation Leadership',
    'How often do leaders in your organisation encourage the need for innovation and provide the resources to support innovation efforts?',
    'Innovation leadership inspires organisations to foster a creative culture. They do not only champion and support creative thinking but also provide strategic direction, allocate resources, and create an environment where experimentation and calculated risk-taking are encouraged.',
    3
  )
) as q(category, title, question_text, definition, sort_order)
where not exists (
  select 1
  from public.session_questions existing
  where existing.session_id = s.id
    and existing.category = q.category
    and existing.is_default = true
);

-- ------------------------------------------------------------
-- 6. Migrate every existing response into a participant
-- ------------------------------------------------------------

with numbered_responses as (
  select
    r.id as response_id,
    r.session_id,
    r.submitted_at,
    row_number() over (
      partition by r.session_id
      order by r.submitted_at, r.id
    ) as participant_number
  from public.responses r
)
insert into public.participants (
  session_id,
  participant_code,
  started_at,
  completed_at,
  legacy_response_id
)
select
  nr.session_id,
  'LEGACY-' || lpad(nr.participant_number::text, 4, '0'),
  nr.submitted_at,
  nr.submitted_at,
  nr.response_id
from numbered_responses nr
on conflict (legacy_response_id) do nothing;

-- ------------------------------------------------------------
-- 7. Migrate the three scores for every historical response
-- ------------------------------------------------------------

insert into public.participant_answers (
  participant_id,
  question_id,
  score,
  answered_at
)
select
  p.id,
  q.id,
  score_data.score,
  r.submitted_at
from public.responses r
join public.participants p
  on p.legacy_response_id = r.id
join (
  select
    session_id,
    id,
    category
  from public.session_questions
  where is_default = true
) q
  on q.session_id = r.session_id
join lateral (
  values
    ('culture', r.culture_score),
    ('practices', r.practices_score),
    ('leadership', r.leadership_score)
) as score_data(category, score)
  on score_data.category = q.category
on conflict (participant_id, question_id) do nothing;

-- ------------------------------------------------------------
-- 8. Remove old policies so the new policies are consistent
-- ------------------------------------------------------------

do $$
declare
  v_table_name text;
  policy_record record;
begin
  foreach v_table_name in array array[
    'sessions',
    'responses',
    'session_questions',
    'participants',
    'participant_answers'
  ]
  loop
    for policy_record in
      select p.policyname
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_table_name
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        policy_record.policyname,
        v_table_name
      );
    end loop;
  end loop;
end
$$;

-- Enable row-level security.
alter table public.sessions enable row level security;
alter table public.responses enable row level security;
alter table public.session_questions enable row level security;
alter table public.participants enable row level security;
alter table public.participant_answers enable row level security;

-- ------------------------------------------------------------
-- 9. Sessions access policies
-- ------------------------------------------------------------

create policy "Facilitators can view their own sessions"
on public.sessions
for select
to authenticated
using (created_by = auth.uid());

create policy "Participants can view available sessions"
on public.sessions
for select
to anon, authenticated
using (
  is_active = true
  and (now() at time zone 'Asia/Singapore')::date
      between start_date and end_date
);

create policy "Facilitators can create their own sessions"
on public.sessions
for insert
to authenticated
with check (created_by = auth.uid());

create policy "Facilitators can update their own sessions"
on public.sessions
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "Facilitators can delete their own sessions"
on public.sessions
for delete
to authenticated
using (created_by = auth.uid());

-- ------------------------------------------------------------
-- 10. Questions access policies
-- ------------------------------------------------------------

create policy "Facilitators can manage questions for their sessions"
on public.session_questions
for all
to authenticated
using (
  exists (
    select 1
    from public.sessions s
    where s.id = session_questions.session_id
      and s.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.sessions s
    where s.id = session_questions.session_id
      and s.created_by = auth.uid()
  )
);

create policy "Participants can view questions for available sessions"
on public.session_questions
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.sessions s
    where s.id = session_questions.session_id
      and s.is_active = true
      and (now() at time zone 'Asia/Singapore')::date
          between s.start_date and s.end_date
  )
);

-- ------------------------------------------------------------
-- 11. Participants access policies
-- ------------------------------------------------------------

create policy "Facilitators can view participants in their sessions"
on public.participants
for select
to authenticated
using (
  exists (
    select 1
    from public.sessions s
    where s.id = participants.session_id
      and s.created_by = auth.uid()
  )
);

-- Anonymous participant creation and updates will use the
-- secure functions in the next section, not direct table access.

-- ------------------------------------------------------------
-- 12. Participant answers access policies
-- ------------------------------------------------------------

create policy "Facilitators can view answers for their sessions"
on public.participant_answers
for select
to authenticated
using (
  exists (
    select 1
    from public.participants p
    join public.sessions s on s.id = p.session_id
    where p.id = participant_answers.participant_id
      and s.created_by = auth.uid()
  )
);

-- ------------------------------------------------------------
-- 13. Preserve historical responses for facilitator viewing
-- ------------------------------------------------------------

create policy "Facilitators can view historical responses"
on public.responses
for select
to authenticated
using (
  exists (
    select 1
    from public.sessions s
    where s.id = responses.session_id
      and s.created_by = auth.uid()
  )
);

-- ------------------------------------------------------------
-- 14. Function: start or resume an anonymous participant
-- ------------------------------------------------------------

create or replace function public.start_or_resume_participant(
  p_session_id uuid,
  p_browser_token uuid
)
returns table (
  participant_id uuid,
  participant_code text,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token_hash text;
  v_participant_id uuid;
  v_participant_code text;
  v_completed_at timestamptz;
begin
  if p_browser_token is null then
    raise exception 'A browser token is required.';
  end if;

  if not exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and s.is_active = true
      and (now() at time zone 'Asia/Singapore')::date
          between s.start_date and s.end_date
  ) then
    raise exception 'This session is not currently available.';
  end if;

  -- The browser token is a randomly generated UUID.
  -- Store its hash instead of the original token.
  v_token_hash := md5(p_browser_token::text);

  select
    p.id,
    p.participant_code,
    p.completed_at
  into
    v_participant_id,
    v_participant_code,
    v_completed_at
  from public.participants p
  where p.session_id = p_session_id
    and p.browser_token_hash = v_token_hash;

  if not found then
    insert into public.participants (
      session_id,
      participant_code,
      browser_token_hash
    )
    values (
      p_session_id,
      'P-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
      v_token_hash
    )
    returning
      id,
      participants.participant_code,
      participants.completed_at
    into
      v_participant_id,
      v_participant_code,
      v_completed_at;
  end if;

  return query
  select
    v_participant_id,
    v_participant_code,
    v_completed_at;
end;
$$;

-- ------------------------------------------------------------
-- 15. Function: save or update an answer
-- ------------------------------------------------------------

create or replace function public.save_participant_answer(
  p_participant_id uuid,
  p_browser_token uuid,
  p_question_id uuid,
  p_score integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_token_hash text;
  v_completed_at timestamptz;
begin
  if p_score < 1 or p_score > 5 then
    raise exception 'Score must be between 1 and 5.';
  end if;

  v_token_hash := md5(p_browser_token::text);

  select
    p.session_id,
    p.completed_at
  into
    v_session_id,
    v_completed_at
  from public.participants p
  where p.id = p_participant_id
    and p.browser_token_hash = v_token_hash;

  if not found then
    raise exception 'Participant could not be verified.';
  end if;

  if v_completed_at is not null then
    raise exception 'This survey has already been completed.';
  end if;

  if not exists (
    select 1
    from public.sessions s
    where s.id = v_session_id
      and s.is_active = true
      and (now() at time zone 'Asia/Singapore')::date
          between s.start_date and s.end_date
  ) then
    raise exception 'This session is no longer available.';
  end if;

  if not exists (
    select 1
    from public.session_questions q
    where q.id = p_question_id
      and q.session_id = v_session_id
  ) then
    raise exception 'The question does not belong to this session.';
  end if;

  insert into public.participant_answers (
    participant_id,
    question_id,
    score,
    answered_at
  )
  values (
    p_participant_id,
    p_question_id,
    p_score,
    now()
  )
  on conflict (participant_id, question_id)
  do update set
    score = excluded.score,
    answered_at = now();
end;
$$;

-- ------------------------------------------------------------
-- 16. Function: retrieve saved answers when resuming
-- ------------------------------------------------------------

create or replace function public.get_participant_answers(
  p_participant_id uuid,
  p_browser_token uuid
)
returns table (
  question_id uuid,
  score integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.participants p
    where p.id = p_participant_id
      and p.browser_token_hash = md5(p_browser_token::text)
  ) then
    raise exception 'Participant could not be verified.';
  end if;

  return query
  select
    a.question_id,
    a.score
  from public.participant_answers a
  where a.participant_id = p_participant_id;
end;
$$;

-- ------------------------------------------------------------
-- 17. Function: mark a participant as completed
-- ------------------------------------------------------------

create or replace function public.complete_participant(
  p_participant_id uuid,
  p_browser_token uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_question_count integer;
  v_answer_count integer;
begin
  select p.session_id
  into v_session_id
  from public.participants p
  where p.id = p_participant_id
    and p.browser_token_hash = md5(p_browser_token::text)
    and p.completed_at is null;

  if not found then
    raise exception 'Participant could not be verified or survey is already completed.';
  end if;

  select count(*)
  into v_question_count
  from public.session_questions q
  where q.session_id = v_session_id;

  select count(*)
  into v_answer_count
  from public.participant_answers a
  join public.session_questions q on q.id = a.question_id
  where a.participant_id = p_participant_id
    and q.session_id = v_session_id;

  if v_question_count = 0 or v_answer_count <> v_question_count then
    raise exception 'Please answer every question before submitting.';
  end if;

  update public.participants
  set completed_at = now()
  where id = p_participant_id;
end;
$$;

-- Restrict these functions to the public-facing roles.
revoke all on function public.start_or_resume_participant(uuid, uuid)
from public;

revoke all on function public.save_participant_answer(uuid, uuid, uuid, integer)
from public;

revoke all on function public.get_participant_answers(uuid, uuid)
from public;

revoke all on function public.complete_participant(uuid, uuid)
from public;

grant execute on function public.start_or_resume_participant(uuid, uuid)
to anon, authenticated;

grant execute on function public.save_participant_answer(uuid, uuid, uuid, integer)
to anon, authenticated;

grant execute on function public.get_participant_answers(uuid, uuid)
to anon, authenticated;

grant execute on function public.complete_participant(uuid, uuid)
to anon, authenticated;

commit;

-- ============================================================
-- END OF INNOPOLL DATABASE SETUP
-- ============================================================