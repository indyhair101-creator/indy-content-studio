create table if not exists dashboard_snapshots (
  workspace_key text primary key,
  version bigint not null default 1,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists line_connections (
  connection_key text primary key check (connection_key = 'primary'),
  status text not null check (status in ('not_connected', 'pairing', 'connected', 'disabled')),
  encrypted_user_id text,
  display_name text,
  paired_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists line_pairing_codes (
  id uuid primary key,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists line_webhook_events (
  webhook_event_id text primary key,
  received_at timestamptz not null default now()
);

create table if not exists line_reviews (
  review_code text primary key,
  content_id text not null,
  cycle_id text not null,
  encrypted_recipient_user_id text not null,
  created_at timestamptz not null default now(),
  unique (content_id, cycle_id)
);

create table if not exists line_review_events (
  id text primary key,
  review_code text not null references line_reviews(review_code) on delete cascade,
  event text not null check (event in ('queued', 'sent', 'approved', 'correction-requested', 'failed')),
  comment text,
  occurred_at timestamptz not null,
  provider_receipt text,
  webhook_event_id text unique,
  created_at timestamptz not null default now()
);

create index if not exists line_review_events_review_code_occurred_at_idx
  on line_review_events (review_code, occurred_at, id);

create table if not exists line_deliveries (
  id uuid primary key,
  idempotency_key text not null unique,
  content_id text not null,
  content_revision text not null,
  asset_id text not null,
  caption_snapshot text not null,
  status text not null check (status in ('queued', 'sent', 'failed')),
  attempt_count integer not null default 0,
  error_category text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
