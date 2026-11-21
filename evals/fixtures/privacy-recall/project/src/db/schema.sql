create table users (
  id uuid primary key,
  email text not null unique,
  full_name text not null,
  phone text,
  date_of_birth date,
  password_hash text not null,
  plan text not null default 'member',
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key,
  user_id uuid not null references users(id),
  expires_at timestamptz not null
);

create table uploads (
  id uuid primary key,
  user_id uuid not null references users(id),
  storage_key text not null,
  created_at timestamptz not null default now()
);

create table notes (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  body text not null
);

create table payment_methods (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  card_last4 text not null,
  processor_token text not null
);

create table password_reset_tokens (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);
