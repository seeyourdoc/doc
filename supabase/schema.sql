-- SeeYourDoctor database schema. Run once in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  phone text,
  country text,
  created_at timestamptz not null default now()
);

create table admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,
  email text unique not null,
  created_at timestamptz not null default now()
);

create table doctors (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,
  full_name text not null,
  email text unique not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table consultation_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_minutes int not null check (duration_minutes > 0),
  price_cents int not null check (price_cents > 0),
  description text not null default '',
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text unique not null,
  user_id uuid not null references users(id),
  package_id uuid references consultation_packages(id) on delete set null,
  package_name text not null,
  duration_minutes int not null,
  amount_cents int not null,
  currency text not null,
  consultation_type text not null check (consultation_type in ('chat','video')),
  preferred_at timestamptz not null,
  notes text not null default '',
  access_code text,
  payment_status text not null default 'pending' check (payment_status in ('pending','success','failed','refunded')),
  consultation_status text not null default 'pending' check (consultation_status in ('pending','scheduled','active','completed','terminated')),
  created_at timestamptz not null default now()
);
create index on bookings (created_at desc);
create index on bookings (user_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  paystack_reference text unique not null,
  paystack_transaction_id text,
  amount_cents int not null,
  currency text not null,
  channel text,
  status text not null default 'pending' check (status in ('pending','success','failed','refunded')),
  paid_at timestamptz,
  gateway_response jsonb,
  created_at timestamptz not null default now()
);
create index on payments (booking_id);

create table contributions (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  amount_cents int not null check (amount_cents > 0),
  currency text not null,
  paystack_reference text unique not null,
  channel text,
  status text not null default 'pending' check (status in ('pending','success','failed','refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table consultation_rooms (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid unique not null references bookings(id) on delete cascade,
  doctor_id uuid references doctors(id) on delete set null,
  consultation_type text not null check (consultation_type in ('chat','video')),
  access_token text unique not null,
  livekit_room text unique not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  terminated boolean not null default false,
  reminder_sent boolean not null default false,
  expiry_notified boolean not null default false,
  open_notified boolean not null default false,
  ending_notified boolean not null default false,
  last_msg_notice_at timestamptz,
  created_at timestamptz not null default now()
);
create index on consultation_rooms (doctor_id);

create table chat_rooms (
  id uuid primary key default gen_random_uuid(),
  room_id uuid unique not null references consultation_rooms(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_room_id uuid not null references chat_rooms(id) on delete cascade,
  sender_role text not null check (sender_role in ('patient','doctor')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index on chat_messages (chat_room_id, created_at);

create table video_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references consultation_rooms(id) on delete cascade,
  participant_role text not null check (participant_role in ('patient','doctor')),
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete set null,
  to_email text not null,
  kind text not null,
  subject text not null,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);

create table site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Lock everything down. The API server uses the service role key, which bypasses RLS.
-- With no policies, the public anon key cannot read or write any table.
alter table users enable row level security;
alter table admins enable row level security;
alter table doctors enable row level security;
alter table consultation_packages enable row level security;
alter table bookings enable row level security;
alter table payments enable row level security;
alter table contributions enable row level security;
alter table consultation_rooms enable row level security;
alter table chat_rooms enable row level security;
alter table chat_messages enable row level security;
alter table video_sessions enable row level security;
alter table notifications enable row level security;
alter table site_settings enable row level security;

-- Default packages (all editable from the admin dashboard).
insert into consultation_packages (name, duration_minutes, price_cents, description, sort_order) values
  ('4 Hours', 240, 5000, 'A focused online consultation window for one concern.', 1),
  ('8 Hours', 480, 10000, 'A full day of access to your doctor for follow-up questions.', 2),
  ('1 Week', 10080, 30000, 'Seven days of access for ongoing questions and check-ins.', 3);

-- Default settings. Dates are managed from the admin dashboard.
insert into site_settings (key, value) values
  ('site_name', '"SeeYourDoctor"'),
  ('doctor_name', '"Your Doctor"'),
  ('doctor_description', '"Online consultations by chat or live video."'),
  ('booking_open', 'true'),
  ('countdown_enabled', 'true'),
  ('currency', '"USD"'),
  ('payment_channels', '["card","apple_pay"]'),
  ('contributions_enabled', 'true')
on conflict (key) do nothing;

-- After creating your admin user in Supabase Auth > Users, link it:
-- insert into admins (auth_user_id, email) values ('<auth user uuid>', 'you@example.com');
