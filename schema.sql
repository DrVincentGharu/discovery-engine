create table if not exists submissions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  cluster text not null,
  remembered text,
  tried text,
  went_wrong text,
  workaround text,
  ip_hash text
);
-- Lock the table: browsers can never read/write it directly.
-- Only the server (using the secret key) can.
alter table submissions enable row level security;
