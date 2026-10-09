import test from 'node:test';
import assert from 'node:assert/strict';
import { runReviewMigrations } from './migrate-review.mjs';

test('ordinary builds do not access a database', async () => {
  let called = false;
  assert.deepEqual(await runReviewMigrations({ environment: {}, executeBatch: async () => { called = true; } }), { applied: false });
  assert.equal(called, false);
});
test('explicit migration without a database fails closed', async () => {
  await assert.rejects(runReviewMigrations({ environment: { INDY_APPLY_REVIEW_MIGRATIONS: '1' } }), /not configured/);
});
test('additive migrations share one transaction and keep the PostgreSQL block intact', async () => {
  let calls = 0;
  const result = await runReviewMigrations({ environment: { INDY_APPLY_REVIEW_MIGRATIONS: '1', DATABASE_URL: 'test-only' }, executeBatch: async (statements) => {
    calls++;
    assert.match(statements[0], /pg_advisory_xact_lock/);
    assert.equal(statements.length, 10);
    const block = statements.find((statement) => statement.startsWith('do $migration$'));
    assert.ok(block?.endsWith('$migration$;'));
    assert.match(block, /having count\(\*\) > 1/);
    assert.ok(statements.some((statement) => statement.includes('add column if not exists snapshot')));
    assert.ok(statements.every((statement) => !/\b(drop\s+(table|column|database)|delete\s+from|truncate\s)/i.test(statement)));
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result, { applied: true, migrations: 5 });
});
