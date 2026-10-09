-- The reviewed content and media metadata remain immutable for the life of a job.
-- Apply after the LINE review snapshot migration.
create table if not exists approved_publication_jobs (
  id text primary key,
  content_id text not null,
  cycle_id text not null,
  review_code text not null references line_reviews(review_code),
  platform text not null check (platform in ('facebook', 'instagram', 'tiktok')),
  publish_at timestamptz,
  snapshot jsonb not null,
  status text not null check (status in ('queued', 'publishing', 'published', 'failed', 'cancelled')),
  provider_publication_id text,
  receipt_url text,
  error_code text,
  signal_error text,
  signaled_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, cycle_id, platform),
  check (status not in ('queued', 'publishing', 'published') or publish_at is not null),
  check (status <> 'published' or nullif(provider_publication_id, '') is not null or nullif(receipt_url, '') is not null)
);
-- statement-breakpoint
create index if not exists approved_publication_jobs_due_idx on approved_publication_jobs(publish_at) where status = 'queued';
