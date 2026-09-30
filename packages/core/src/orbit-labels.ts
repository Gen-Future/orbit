import type { OrbitPoint } from './orbit-position';
export type StarAnchor = { id: string; quadrant: number; anchor: OrbitPoint };
export type StarLabel = StarAnchor & { label: OrbitPoint };

// Labels may move to avoid each other; the real coordinate anchor never moves.
export function layoutStarLabels(
  anchors: StarAnchor[],
  width: number,
  height: number,
  compact: boolean,
): StarLabel[][] {
  const labelWidth = compact ? 120 : 176;
  const labelHeight = compact ? 58 : 62;
  const pages: StarLabel[][] = [];
  for (const quadrant of [3, 1, 4, 2]) {
    const inQuadrant = anchors.filter((item) => item.quadrant === quadrant);
    const right = [1, 2].includes(quadrant),
      upper = [1, 3].includes(quadrant);
    const left = right ? width / 2 : 0,
      top = upper ? 0 : height / 2;
    const minX = left + labelWidth / 2 + 12,
      maxX = left + width / 2 - labelWidth / 2 - 12;
    const minY = top + (upper ? 85 : 50),
      maxY = top + height / 2 - (upper ? 43 : 84);
    let page = 0;
    for (const item of inQuadrant) {
      const options: OrbitPoint[] = [];
      const ideal = { x: item.anchor.x, y: item.anchor.y + 42 };
      options.push({
        x: Math.max(minX, Math.min(maxX, ideal.x)),
        y: Math.max(minY, Math.min(maxY, ideal.y)),
      });
      for (let yi = 0; yi <= 12; yi++)
        for (let xi = 0; xi <= 6; xi++)
          options.push({ x: minX + ((maxX - minX) * xi) / 6, y: minY + ((maxY - minY) * yi) / 12 });
      const cost = (point: OrbitPoint) =>
        Math.hypot(point.x - ideal.x, point.y - ideal.y) +
        inQuadrant
          .slice(0, 12)
          .reduce(
            (penalty, star) =>
              penalty +
              (Math.abs(point.x - star.anchor.x) < labelWidth / 2 + 12 &&
              Math.abs(point.y - star.anchor.y) < labelHeight / 2 + 12
                ? 100
                : 0),
            0,
          );
      options.sort((a, b) => cost(a) - cost(b));
      while (true) {
        const occupied = (pages[page] || []).filter((star) => star.quadrant === quadrant);
        const point =
          occupied.length < (compact ? 3 : 6)
            ? options.find(
                (candidate) =>
                  Math.hypot(
                    Math.max(0, Math.abs(candidate.x - width / 2) - labelWidth / 2),
                    Math.max(0, Math.abs(candidate.y - height / 2) - labelHeight / 2),
                  ) >= (compact ? 42 : 57) &&
                  !occupied.some(
                    (star) =>
                      Math.abs(star.label.x - candidate.x) < labelWidth + 8 &&
                      Math.abs(star.label.y - candidate.y) < labelHeight + 8,
                  ),
              )
            : undefined;
        if (point) {
          (pages[page] ||= []).push({ ...item, label: point });
          break;
        }
        page++;
      }
    }
  }
  return pages.length ? pages : [[]];
}
