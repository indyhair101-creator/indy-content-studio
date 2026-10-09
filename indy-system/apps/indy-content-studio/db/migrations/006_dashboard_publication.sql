-- Keep the existing LINE foreign key; dashboard approvals do not invent LINE reviews.
alter table approved_publication_jobs add column if not exists approval_source text not null default 'line' check (approval_source in ('line', 'dashboard'));
-- statement-breakpoint
alter table approved_publication_jobs alter column review_code drop not null;
-- statement-breakpoint
create unique index if not exists approved_publication_slot_idx on approved_publication_jobs(content_id, platform, publish_at)
  where status in ('queued', 'publishing', 'published');
