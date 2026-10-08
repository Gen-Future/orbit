import { db } from '../src/lib/db';
import { encrypt, passwordHash } from '../src/lib/security';

const email = process.env.ORBIT_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ORBIT_ADMIN_PASSWORD;
const endpointName = process.env.AI_ENDPOINT_NAME?.trim() || '系统默认';
const provider = process.env.AI_PROVIDER || 'openai';
const baseUrl = process.env.AI_BASE_URL?.trim();
const model = process.env.AI_MODEL?.trim();
const apiKey = process.env.AI_API_KEY;

if (!email || !password || password.length < 10)
  throw new Error('ORBIT_ADMIN_EMAIL 与至少 10 位的 ORBIT_ADMIN_PASSWORD 为必填项');
if (!['openai', 'ollama'].includes(provider))
  throw new Error('AI_PROVIDER 必须为 openai 或 ollama');
if (!baseUrl || !model) throw new Error('AI_BASE_URL 与 AI_MODEL 为必填项');

const adminEmail = email;
const adminPassword = password;
const endpointBaseUrl = baseUrl;
const endpointModel = model;

async function main() {
  await db.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: adminEmail } });
    if (user) {
      user = await tx.user.update({ where: { id: user.id }, data: { isSystemAdmin: true } });
    } else {
      user = await tx.user.create({
        data: {
          email: adminEmail,
          name: 'Orbit 管理员',
          passwordHash: passwordHash(adminPassword),
          isSystemAdmin: true,
        },
      });
    }

    const membership = await tx.membership.findFirst({ where: { userId: user.id } });
    if (!membership) {
      await tx.workspace.create({
        data: {
          name: 'Orbit 管理空间',
          memberships: { create: { userId: user.id, role: 'owner' } },
          preferences: { create: { userId: user.id } },
        },
      });
    }

    await tx.aIEndpoint.updateMany({ data: { active: false } });
    await tx.aIEndpoint.upsert({
      where: { name: endpointName },
      create: {
        name: endpointName,
        provider,
        baseUrl: endpointBaseUrl,
        model: endpointModel,
        encryptedKey: apiKey ? encrypt(apiKey) : null,
        active: true,
      },
      update: {
        provider,
        baseUrl: endpointBaseUrl,
        model: endpointModel,
        ...(apiKey ? { encryptedKey: encrypt(apiKey) } : {}),
        active: true,
      },
    });
  });

  console.log(`系统管理员已就绪：${adminEmail}`);
  console.log(`当前 AI 端点已激活：${endpointName} / ${endpointModel}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
