import test from 'node:test';
import assert from 'node:assert/strict';
import {
  orbitPosition,
  quadrantAt,
  boundPosition,
  pointToScreen,
  screenToPoint,
} from '../packages/core/src/orbit-position';
import { itemPatch } from '../packages/core/src';
const createdAt = '2026-09-01T00:00:00Z';
const dueAt = '2026-09-30T00:00:00Z';

test('截止引力单调向紧急方向移动，在所有象限内都不越界', () => {
  for (const quadrant of [1, 2, 3, 4]) {
    const item = { id: `star-${quadrant}`, quadrant, createdAt, dueAt, status: 'open' };
    let lastY = -Infinity;
    for (let day = 0; day < 70; day++) {
      const point = orbitPosition(item, Date.parse(createdAt) + day * 864e5);
      assert.equal(quadrantAt(point), quadrant);
      assert.ok(point.y >= lastY);
      lastY = point.y;
    }
    assert.deepEqual(
      orbitPosition(item, Date.parse(createdAt)),
      orbitPosition(item, Date.parse('2026-09-15T00:00:00Z')),
    );
  }
});
test('手动落点是漂移的新锚点，无截止和已完成事项不漂移', () => {
  const item = {
    id: 'manual',
    quadrant: 4,
    createdAt,
    dueAt,
    status: 'open',
    orbitX: -0.35,
    orbitY: -0.6,
    orbitPlacedAt: '2026-09-29T00:00:00Z',
  };
  assert.deepEqual(orbitPosition(item, Date.parse(item.orbitPlacedAt)), { x: -0.35, y: -0.6 });
  const later = orbitPosition(item, Date.parse(dueAt));
  assert.ok(later.y > -0.6 && later.y < 0);
  assert.deepEqual(orbitPosition({ ...item, dueAt: null }, Date.parse(dueAt)), {
    x: -0.35,
    y: -0.6,
  });
  assert.deepEqual(orbitPosition({ ...item, status: 'done' }, Date.parse(dueAt)), {
    x: -0.35,
    y: -0.6,
  });
  assert.deepEqual(
    orbitPosition(
      { ...item, orbitPlacedAt: '2026-10-01T00:00:00Z' },
      Date.parse('2026-10-10T00:00:00Z'),
    ),
    { x: -0.35, y: -0.6 },
  );
});
test('手动坐标跨越所有象限，边界与输入均受约束', () => {
  for (const [x, y, q] of [
    [0.5, 0.5, 1],
    [0.5, -0.5, 2],
    [-0.5, 0.5, 3],
    [-0.5, -0.5, 4],
  ])
    assert.equal(quadrantAt({ x, y }), q);
  assert.deepEqual(boundPosition({ x: -3, y: 0 }), { x: -0.88, y: 0.1 });
  for (const position of [{ x: Infinity, y: 0.5 }, { x: NaN, y: 0.5 }, { x: 2, y: 0 }, { x: 0.4 }])
    assert.equal(itemPatch.safeParse({ version: 1, position }).success, false);
});
test('桌面、手机与缩放坐标往返一致，标题区域保留在象限内', () => {
  for (const frame of [
    { width: 390, height: 450, nodeWidth: 117 },
    { width: 1218, height: 650, nodeWidth: 174 },
    { width: 2436, height: 1300, nodeWidth: 174 },
  ]) {
    for (const x of [-0.88, -0.5, -0.1, 0.1, 0.5, 0.88])
      for (const y of [-0.88, -0.5, -0.1, 0.1, 0.5, 0.88]) {
        const point = { x, y },
          screen = pointToScreen(point, frame),
          back = screenToPoint(screen, frame);
        assert.ok(Math.abs(back.x - x) < 1e-10 && Math.abs(back.y - y) < 1e-10);
        assert.ok(
          screen.x - frame.nodeWidth / 2 >= 0 && screen.x + frame.nodeWidth / 2 <= frame.width,
        );
        assert.equal(screen.x > frame.width / 2, x > 0);
        assert.ok(Math.abs(screen.x - frame.width / 2) >= frame.nodeWidth / 2);
        assert.ok(Math.abs(screen.y - frame.height / 2) >= 40);
      }
  }
});

test('移动坐标的 PATCH 不会默认清空笔记或重置象限', () => {
  assert.deepEqual(itemPatch.parse({ version: 1, position: { x: -0.4, y: 0.6 } }), {
    version: 1,
    position: { x: -0.4, y: 0.6 },
  });
  assert.deepEqual(itemPatch.parse({ version: 2, status: 'done' }), { version: 2, status: 'done' });
});

import { layoutStarLabels } from '../packages/core/src/orbit-labels';
test('密集标签分页而非重叠，真实锚点在手机和桌面均保持不变', () => {
  for (const [width, height, compact] of [
    [390, 450, true],
    [1440, 700, false],
  ] as const) {
    const anchors = Array.from({ length: 32 }, (_, index) => ({
      id: `star-${index}`,
      quadrant: (index % 4) + 1,
      anchor: {
        x: width * ([1, 2].includes((index % 4) + 1) ? 0.75 : 0.25),
        y: height * ([1, 3].includes((index % 4) + 1) ? 0.25 : 0.75),
      },
    }));
    const pages = layoutStarLabels(anchors, width, height, compact);
    assert.equal(pages.flat().length, anchors.length);
    assert.equal(new Set(pages.flat().map((star) => star.id)).size, anchors.length);
    for (const page of pages)
      for (const [index, star] of page.entries()) {
        assert.deepEqual(star.anchor, anchors.find((anchor) => anchor.id === star.id)!.anchor);
        assert.equal(star.label.x > width / 2, [1, 2].includes(star.quadrant));
        assert.equal(star.label.y < height / 2, [1, 3].includes(star.quadrant));
        for (const other of page.slice(index + 1))
          assert.ok(
            Math.abs(other.label.x - star.label.x) >= (compact ? 120 : 176) + 8 ||
              Math.abs(other.label.y - star.label.y) >= (compact ? 58 : 62) + 8,
          );
      }
  }
});

test('时间沉积带为右侧象限标签预留空间', () => {
  const width = 1440;
  const pages = layoutStarLabels(
    [
      { id: 'right-top', quadrant: 1, anchor: { x: 1320, y: 180 } },
      { id: 'right-bottom', quadrant: 2, anchor: { x: 1320, y: 520 } },
      { id: 'left-top', quadrant: 3, anchor: { x: 120, y: 180 } },
    ],
    width,
    700,
    false,
    88,
  );
  for (const item of pages.flat()) {
    if ([1, 2].includes(item.quadrant)) assert.ok(item.label.x + 88 <= width - 88);
    else assert.ok(item.label.x < width / 2);
  }
});
