create table if not exists line_active_reviews (
  recipient_hash text primary key,
  review_code text not null references line_reviews(review_code),
  decision text not null check (decision in ('sending', 'pending', 'correction-requested', 'approved')),
  previous_review_code text references line_reviews(review_code),
  previous_decision text check (previous_decision in ('pending', 'correction-requested', 'approved')),
  updated_at timestamptz not null default now()
);

-- statement-breakpoint
do $migration$
begin
  if not exists (
    select review_code from line_review_events
    where event in ('approved', 'correction-requested')
    group by review_code having count(*) > 1
  ) then
    execute 'create unique index if not exists line_review_one_terminal_decision_idx
      on line_review_events (review_code) where event in (''approved'', ''correction-requested'')';
  end if;
end;
$migration$;
