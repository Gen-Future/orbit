import test from 'node:test';
import assert from 'node:assert/strict';
import { Queue, QueueEvents, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { randomUUID } from 'node:crypto';
test('真实 Redis 队列：失败重试与相同 jobId 去重', async () => {
  const connection = new IORedis(process.env.TEST_REDIS_URL || 'redis://127.0.0.1:56379', {
    maxRetriesPerRequest: null,
  });
  const name = `orbit-test-${randomUUID()}`;
  const queue = new Queue(name, { connection });
  const events = new QueueEvents(name, { connection });
  let calls = 0;
  const worker = new Worker(
    name,
    async () => {
      calls++;
      if (calls === 1) throw new Error('transient test failure');
      return { delivered: true };
    },
    { connection },
  );
  try {
    await events.waitUntilReady();
    const job = await queue.add(
      'notification',
      { id: 'same' },
      { jobId: 'dedupe', attempts: 3, backoff: { type: 'fixed', delay: 50 } },
    );
    await queue.add('notification', { id: 'same' }, { jobId: 'dedupe' });
    const result = await job.waitUntilFinished(events, 10000);
    assert.deepEqual(result, { delivered: true });
    assert.equal(calls, 2);
  } finally {
    await worker.close();
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await connection.quit();
  }
});
