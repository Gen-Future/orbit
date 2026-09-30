// Logical map coordinates: importance grows rightward, urgency grows upward.
export type OrbitPoint = { x: number; y: number };
export type PositionedItem = {
  id: string;
  quadrant: number;
  createdAt: string;
  dueAt: string | null;
  status: string;
  orbitX?: number | null;
  orbitY?: number | null;
  orbitPlacedAt?: string | null;
};
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export function stableSeed(id: string) {
  let value = 2166136261;
  for (const char of id) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}
export function quadrantAt({ x, y }: OrbitPoint) {
  return y >= 0 ? (x >= 0 ? 1 : 3) : x >= 0 ? 2 : 4;
}
export function boundPosition(point: OrbitPoint): OrbitPoint {
  const bound = (n: number) => (n < 0 ? -1 : 1) * clamp(Math.abs(n), 0.1, 0.88);
  return { x: bound(point.x), y: bound(point.y) };
}
export function defaultPosition(item: Pick<PositionedItem, 'id' | 'quadrant'>): OrbitPoint {
  const seed = stableSeed(item.id);
  const x = 0.25 + (seed % 1000) / 2000;
  const y = 0.28 + ((seed >>> 10) % 1000) / 2000;
  return { x: [1, 2].includes(item.quadrant) ? x : -x, y: [1, 3].includes(item.quadrant) ? y : -y };
}
export function deadlinePressure(dueAt: string | null, now: number) {
  return dueAt ? clamp(1 - (Date.parse(dueAt) - now) / (14 * 864e5), 0, 1) : 0;
}
export function orbitPosition(item: PositionedItem, now: number): OrbitPoint {
  const stored =
    item.orbitX != null && item.orbitY != null ? { x: item.orbitX, y: item.orbitY } : null;
  const base = stored && quadrantAt(stored) === item.quadrant ? stored : defaultPosition(item);
  if (!item.dueAt || item.status === 'done') return base;
  const deadline = Date.parse(item.dueAt);
  const anchor = Date.parse(stored && item.orbitPlacedAt ? item.orbitPlacedAt : item.createdAt);
  // A manual placement made after a deadline stays exactly where the user put it.
  if (stored && deadline <= anchor) return base;
  const start = Math.max(anchor, deadline - 14 * 864e5);
  const progress =
    deadline <= start ? (now >= deadline ? 1 : 0) : clamp((now - start) / (deadline - start), 0, 1);
  const ceiling = [1, 3].includes(item.quadrant) ? 0.88 : -0.1;
  // Preserve some spacing between stars even after several deadlines have passed.
  const target = base.y + (ceiling - base.y) * 0.76;
  return { x: base.x, y: base.y + (target - base.y) * progress };
}

export type OrbitFrame = { width: number; height: number; nodeWidth: number };
function mapAxis(value: number, length: number, padding: number, inverse = false) {
  const half = length / 2;
  const pad = Math.min(padding, half * 0.44);
  const range = half - 2 * pad;
  if (inverse) {
    const delta = value - half;
    return (delta < 0 ? -1 : 1) * clamp(0.1 + ((Math.abs(delta) - pad) / range) * 0.78, 0.1, 0.88);
  }
  return (
    half + (value < 0 ? -1 : 1) * (pad + ((clamp(Math.abs(value), 0.1, 0.88) - 0.1) / 0.78) * range)
  );
}
export function pointToScreen(point: OrbitPoint, frame: OrbitFrame): OrbitPoint {
  return {
    x: mapAxis(point.x, frame.width, frame.nodeWidth / 2 + 10),
    y: frame.height - mapAxis(point.y, frame.height, frame.nodeWidth < 100 ? 66 : 87),
  };
}
export function screenToPoint(point: OrbitPoint, frame: OrbitFrame): OrbitPoint {
  return {
    x: mapAxis(point.x, frame.width, frame.nodeWidth / 2 + 10, true),
    y: mapAxis(frame.height - point.y, frame.height, frame.nodeWidth < 100 ? 66 : 87, true),
  };
}
