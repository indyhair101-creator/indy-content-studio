create table if not exists line_unmatched_feedback (
  id text primary key,
  webhook_event_id text not null unique references line_webhook_events(webhook_event_id),
  recipient_hash text not null,
  comment text not null check (length(trim(comment)) > 0),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
