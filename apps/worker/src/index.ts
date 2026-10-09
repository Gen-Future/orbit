import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { scanNotifications, deliverNotifications } from '../../../src/lib/notifications';
import { styleSuggestionPass } from '../../../src/lib/reports';
import { syncCalendar } from '../../../src/lib/report-calendar';
import { db } from '../../../src/lib/db';
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
const queue = new Queue('orbit-reminders', { connection });
const reportQueue = new Queue('orbit-report-enrichment', { connection });
async function start() {
  await queue.upsertJobScheduler(
    'minute-scan',
    { every: 60000 },
    {
      name: 'scan',
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    },
  );
  const worker = new Worker(
    'orbit-reminders',
    async () => {
      await scanNotifications();
      await deliverNotifications();
      await connection.set('orbit:worker:heartbeat', new Date().toISOString(), 'EX', 180);
    },
    { connection, concurrency: 1 },
  );
  await reportQueue.upsertJobScheduler(
    'report-enrichment',
    { every: 60000 },
    {
      name: 'enrich',
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    },
  );
  const reportWorker = new Worker(
    'orbit-report-enrichment',
    async () => {
      await styleSuggestionPass();
      const calendarDay = new Date().toISOString().slice(0, 10);
      if ((await connection.get('orbit:calendar:synced-day')) !== calendarDay) {
        const year = new Date().getUTCFullYear();
        await Promise.all([syncCalendar(year), syncCalendar(year + 1)]);
        await connection.set('orbit:calendar:synced-day', calendarDay, 'EX', 86400);
      }
    },
    { connection, concurrency: 1 },
  );
  reportWorker.on('failed', (job, error) =>
    console.error(
      JSON.stringify({ event: 'report_enrichment_failed', jobId: job?.id, error: error.message }),
    ),
  );
  worker.on('failed', (job, error) =>
    console.error(JSON.stringify({ event: 'worker_failed', jobId: job?.id, error: error.message })),
  );
  console.log('Orbit worker ready');
  let stopping = false;
  async function close() {
    if (stopping) return;
    stopping = true;
    await Promise.all([worker.close(), reportWorker.close()]);
    await Promise.all([queue.close(), reportQueue.close()]);
    if (connection.status !== 'end') await connection.quit();
    await db.$disconnect();
    process.exit(0);
  }
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
}
start().catch((error) => {
  console.error(error);
  process.exit(1);
});
