/** Development verification: logical snapshot and restore into a new local database.
 * Production uses pg_dump/pg_restore in scripts/backup.sh and scripts/restore.sh.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const tables = [
  'User',
  'Workspace',
  'Session',
  'Membership',
  'Project',
  'Item',
  'ItemEvent',
  'Reminder',
  'AIJob',
  'AIConfig',
  'AccessToken',
  'MutationReceipt',
  'Report',
  'NotificationPreference',
  'PushSubscription',
  'Notification',
  'RateBucket',
];
async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: resolve('.data/postgres'),
    user: 'orbit',
    password: process.env.LOCAL_DB_PASSWORD || 'orbit',
    port: 55432,
    persistent: true,
  });
  const source = pg.getPgClient('orbit');
  await source.connect();
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot: Record<string, unknown[]> = {};
  for (const table of tables) {
    const rows = await source.query(
      `SELECT row_to_json(t) AS row FROM "${table}" t${table === 'Item' ? ' ORDER BY "parentId" NULLS FIRST' : ''}`,
    );
    snapshot[table] = rows.rows.map((r: { row: unknown }) => r.row);
  }
  await source.query('COMMIT');
  mkdirSync('backups', { recursive: true });
  const name = `orbit_restore_${Date.now()}`;
  writeFileSync(
    `backups/${name}.json`,
    JSON.stringify({ format: 'orbit-local-snapshot-v1', tables: snapshot }),
    { mode: 0o600 },
  );
  await source.query(`CREATE DATABASE "${name}"`);
  const restore = pg.getPgClient(name);
  await restore.connect();
  await restore.query(readFileSync('prisma/migrations/202609290001_initial/migration.sql', 'utf8'));
  await restore.query('BEGIN');
  for (const table of tables)
    for (const row of snapshot[table])
      await restore.query(
        `INSERT INTO "${table}" SELECT * FROM json_populate_record(NULL::"${table}",$1::json)`,
        [JSON.stringify(row)],
      );
  await restore.query('COMMIT');
  for (const table of tables) {
    const result = await restore.query(`SELECT count(*)::int AS count FROM "${table}"`);
    if (result.rows[0].count !== snapshot[table].length)
      throw new Error(`${table} restore mismatch`);
  }
  console.log(`Verified ${tables.length} tables restored into ${name}; source database unchanged.`);
  await restore.end();
  await source.end();
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
