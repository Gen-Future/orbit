import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { db } from './db';
import { HttpError, invariant } from './errors';
import { can, type Role, type Scope } from '../../packages/core/src';
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  await db.session.create({
    data: { userId, tokenHash: hash(token), expiresAt: new Date(Date.now() + 30 * 864e5) },
  });
  return token;
}
export function cookieToken(req: Request) {
  return req.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('orbit_session='))
    ?.slice(14);
}
export async function getUser(req: Request) {
  const token = cookieToken(req);
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: true },
  });
  return session && session.expiresAt > new Date() ? session.user : null;
}
export type Actor = {
  id: string;
  userId?: string;
  workspaceId: string;
  role: Role;
  scopes?: string[];
};
export async function authorize(req: Request, workspaceId: string, scope: Scope): Promise<Actor> {
  const bearer = req.headers.get('authorization');
  if (bearer?.startsWith('Bearer ')) {
    const token = await db.accessToken.findUnique({ where: { tokenHash: hash(bearer.slice(7)) } });
    invariant(
      token && !token.revokedAt && token.expiresAt > new Date(),
      401,
      '访问令牌无效或已过期',
    );
    invariant(
      token.workspaceId === workspaceId && token.scopes.includes(scope),
      403,
      '没有此工作空间或操作的权限',
    );
    return { id: `token:${token.id}`, workspaceId, role: 'member', scopes: token.scopes };
  }
  const user = await getUser(req);
  invariant(user, 401, '请先登录');
  const member = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  invariant(member && can(member.role, scope), 403, '没有此工作空间或操作的权限');
  return { id: user.id, userId: user.id, workspaceId, role: member.role as Role };
}
export function admin(actor: Actor) {
  invariant(['owner', 'admin'].includes(actor.role) && !actor.scopes, 403, '需要空间管理员权限');
}
export function csrf(req: Request) {
  if (
    ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ||
    req.headers.get('authorization')?.startsWith('Bearer ')
  )
    return;
  const origin = req.headers.get('origin');
  const expected = new URL(process.env.APP_URL || req.url).origin;
  invariant(origin === expected, 403, '请求来源验证失败');
}
export function sessionCookie(token: string, maxAge = 2592000) {
  return `orbit_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false' ? '; Secure' : ''}`;
}
export async function rateLimit(key: string, limit = 30, windowMs = 60000) {
  const bucket = String(Math.floor(Date.now() / windowMs));
  const row = await db.rateBucket.upsert({
    where: { key: `${key}:${bucket}` },
    create: { key: `${key}:${bucket}`, expiresAt: new Date(Date.now() + windowMs) },
    update: { count: { increment: 1 } },
  });
  if (row.count > limit) throw new HttpError(429, '请求过于频繁，请稍后重试');
}
function encryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  invariant(key && /^[a-f0-9]{64}$/i.test(key), 503, '请先配置服务器 ENCRYPTION_KEY');
  return Buffer.from(key, 'hex');
}
export function encrypt(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  return [
    iv.toString('hex'),
    cipher.update(secret, 'utf8', 'hex') + cipher.final('hex'),
    cipher.getAuthTag().toString('hex'),
  ].join(':');
}
export function decrypt(value: string) {
  const [iv, body, tag] = value.split(':');
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'hex'));
  cipher.setAuthTag(Buffer.from(tag, 'hex'));
  return cipher.update(body, 'hex', 'utf8') + cipher.final('utf8');
}
