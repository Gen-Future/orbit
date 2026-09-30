import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
async function main() {
  const databaseDir = resolve('.data/postgres');
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: 'orbit',
    password: process.env.LOCAL_DB_PASSWORD || 'orbit',
    port: Number(process.env.LOCAL_DB_PORT || 55432),
    persistent: true,
    postgresFlags: ['-h', '127.0.0.1', '-k', resolve('.data')],
    onLog: () => {},
    onError: (message) => {
      const value = String(message);
      if (value.includes('FATAL') || value.includes('ERROR')) console.error(value);
    },
  });
  if (!existsSync(`${databaseDir}/PG_VERSION`)) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  for (const name of ['orbit', 'orbit_test']) {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
    if (!result.rowCount) await pg.createDatabase(name);
  }
  await client.end();
  console.log(
    'Orbit PostgreSQL listening on 127.0.0.1:' + String(process.env.LOCAL_DB_PORT || 55432),
  );
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    await pg.stop();
    process.exit(0);
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  setInterval(() => {}, 60000);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
