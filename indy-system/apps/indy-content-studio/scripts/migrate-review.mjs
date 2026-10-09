import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const migrationFiles = [
  '002_line_rejection_feedback.sql',
  '003_line_review_snapshot.sql',
  '004_approved_publication_queue.sql',
  '005_line_unmatched_feedback.sql',
  '006_dashboard_publication.sql',
];

export async function runReviewMigrations({ environment = process.env, executeBatch } = {}) {
  if (environment.INDY_APPLY_REVIEW_MIGRATIONS !== '1') return { applied: false };
  if (!environment.DATABASE_URL) throw new Error('Migration database is not configured');
  const statements = ['SELECT pg_advisory_xact_lock(61440301)'];
  for (const filename of migrationFiles) {
    const sql = await readFile(new URL(`../db/migrations/${filename}`, import.meta.url), 'utf8');
    // Explicit top-level boundaries preserve dollar-quoted PostgreSQL blocks.
    statements.push(...sql.split('-- statement-breakpoint').map((part) => part.trim()).filter(Boolean));
  }
  if (!executeBatch) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(environment.DATABASE_URL);
    executeBatch = (batch) => sql.transaction(batch.map((statement) => sql.query(statement, [])));
  }
  await executeBatch(statements);
  return { applied: true, migrations: migrationFiles.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runReviewMigrations();
    console.log(result.applied ? `Applied ${result.migrations} additive review/queue migrations atomically.` : 'Review migrations disabled for this build.');
  } catch {
    // Database credentials and provider errors must never enter deployment logs.
    console.error('Review/queue database migration failed. Deployment build stopped.');
    process.exitCode = 1;
  }
}
