import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { scanNotifications, deliverNotifications } from '../../../src/lib/notifications';
import { db } from '../../../src/lib/db';
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
const queue = new Queue('orbit-reminders', { connection });
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
  worker.on('failed', (job, error) =>
    console.error(JSON.stringify({ event: 'worker_failed', jobId: job?.id, error: error.message })),
  );
  console.log('Orbit worker ready');
  let stopping = false;
  async function close() {
    if (stopping) return;
    stopping = true;
    await worker.close();
    await queue.close();
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
