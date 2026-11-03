
-- Emphile Engineering Services: CRM + ERP schema
-- Run once in the Supabase SQL Editor of the NEW Engineering project
-- (check the project ref in the address bar before pasting).

create extension if not exists pgcrypto;

-- Staff logins ---------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- CRM ------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  type text,
  contact_name text,
  email text,
  phone text,
  address text,
  notes text
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text,
  phone text,
  service text,
  property_type text,
  message text,
  status text not null default 'New',
  source text default 'Website',
  client_id uuid references public.clients(id) on delete set null,
  notes text
);

-- Staff ----------------------------------------------------------------
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  role text,
  email text,
  phone text,
  pay_type text,
  pay_rate numeric(10,2),
  active boolean not null default true
);

-- Jobs and billing -----------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ref text,
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  type text,
  site_address text,
  status text not null default 'Enquiry',
  engineer_id uuid references public.staff(id) on delete set null,
  scheduled_date date,
  notes text
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  number text,
  client_id uuid references public.clients(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  issue_date date default current_date,
  valid_until date,
  status text not null default 'Draft',
  items jsonb not null default '[]'::jsonb,
  vat_rate numeric(5,2) not null default 0,
  notes text
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  number text,
  client_id uuid references public.clients(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  issue_date date default current_date,
  due_date date,
  status text not null default 'Draft',
  items jsonb not null default '[]'::jsonb,
  vat_rate numeric(5,2) not null default 0,
  notes text
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  invoice_id uuid references public.invoices(id) on delete cascade,
  paid_on date default current_date,
  amount numeric(12,2) not null,
  method text,
  reference text
);

-- Inspections and certificates ------------------------------------------
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid references public.clients(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  property_address text,
  type text,
  inspection_date date,
  next_due date,
  result text,
  certificate_no text,
  engineer_id uuid references public.staff(id) on delete set null,
  notes text
);

-- Rota and expenses ------------------------------------------------------
create table if not exists public.rota (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  staff_id uuid references public.staff(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  shift_date date not null,
  start_time time,
  end_time time,
  notes text
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expense_date date not null default current_date,
  category text,
  description text,
  supplier text,
  amount numeric(12,2) not null,
  job_id uuid references public.jobs(id) on delete set null
);

-- Business settings (left blank until you fill them in) -------------------
create table if not exists public.settings (
  key text primary key,
  value text
);

-- Row level security -----------------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['clients','leads','staff','jobs','quotes','invoices','payments','inspections','rota','expenses','settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin all" on public.%I', t);
    execute format('create policy "admin all" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- The public website form may only INSERT new leads.
drop policy if exists "website enquiry" on public.leads;
create policy "website enquiry" on public.leads for insert to anon
  with check (status = 'New' and source = 'Website' and client_id is null and notes is null);
grant insert on public.leads to anon;

notify pgrst, 'reload schema';

-- AFTER creating your login in Authentication > Users, make yourself admin:
-- update public.profiles set is_admin = true where email = 'YOUR-LOGIN-EMAIL';
