import { db } from '../src/lib/db';
import { passwordHash } from '../src/lib/security';
import { createItem, updateItem } from '../src/lib/items';
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('示例种子只供开发环境使用');
  const email = process.env.SEED_EMAIL || 'demo@orbit.local';
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 10)
    throw new Error('设置 SEED_PASSWORD（至少 10 位）后再运行种子');
  if (await db.user.findUnique({ where: { email } })) {
    console.log('演示账号已存在，未覆盖任何数据。');
    return;
  }
  const user = await db.user.create({
    data: { email, name: 'Orbit Explorer', passwordHash: passwordHash(password) },
  });
  const space = await db.workspace.create({
    data: {
      name: '示例 · 创作工作室',
      memberships: { create: { userId: user.id, role: 'owner' } },
      preferences: { create: { userId: user.id } },
    },
  });
  const actor = { id: user.id, userId: user.id, workspaceId: space.id, role: 'owner' as const };
  const launch = await db.project.create({
    data: {
      workspaceId: space.id,
      name: 'Orbit 产品探索',
      description: '把一个想法，推进成值得每天打开的产品。',
      color: '#d7ff4f',
    },
  });
  const growth = await db.project.create({
    data: {
      workspaceId: space.id,
      name: '长期主义实验',
      description: '给重要但不紧急的事，留一条专属轨道。',
      color: '#b4a0f3',
    },
  });
  const day = (n: number, hour = 18) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const examples = [
    {
      title: '打磨 Orbit 的第一份产品方案',
      notes:
        '让创意落地成一次让人想再打开的体验。聚焦自然语言捕捉、今日主线与完成反馈。\n\n这是用于体验的示例事项，可自由修改。',
      quadrant: 1,
      projectId: launch.id,
      dueAt: day(0),
    },
    {
      title: '整理本周的用户访谈笔记',
      notes: '回看三个关键问题：捕捉是否足够快？提醒是否合适？复盘是否可信？',
      quadrant: 2,
      projectId: launch.id,
      dueAt: day(1),
    },
    {
      title: '为深度工作留出 90 分钟',
      notes: '把消息放一边，专心推进一个重要的决定。',
      quadrant: 2,
      projectId: growth.id,
      dueAt: day(1, 10),
    },
    {
      title: '确认周五设计评审的时间',
      notes: '和相关同事确认参与时间。',
      quadrant: 3,
      projectId: launch.id,
      dueAt: day(2),
    },
    {
      title: '读完收藏的交互设计文章',
      notes: '只记下一个下次真正想试试的想法。',
      quadrant: 4,
      projectId: growth.id,
    },
    {
      title: '探索一个更自然的 AI 输入方式',
      notes: '灵感不必在记录时就变得井井有条。',
      quadrant: 2,
      triageStatus: 'pending',
      projectId: launch.id,
    },
    {
      title: '重新安排搁置的个人作品集',
      notes: '一个小到今天就能开始的下一步是什么？',
      quadrant: 2,
      projectId: growth.id,
      dueAt: day(-1),
    },
    {
      title: '搭建项目的第一条工作轨道',
      notes: '从零开始，也是一种值得记录的进展。',
      quadrant: 2,
      projectId: launch.id,
    },
  ];
  for (let index = 0; index < examples.length; index++) {
    await db.$transaction(async (tx) => {
      const item = await createItem(tx, actor, examples[index], 'sample');
      if (index === 7) await updateItem(tx, actor, item.id, { version: 1, status: 'done' });
      if (index === 0)
        await createItem(
          tx,
          actor,
          { title: '写清首版体验的成功标准', quadrant: 2, parentId: item.id, projectId: launch.id },
          'sample',
        );
    });
  }
  console.log(`已创建 ${email} 与带标注的示例工作区。密码来自 SEED_PASSWORD，未输出。`);
}
main().finally(() => db.$disconnect());
