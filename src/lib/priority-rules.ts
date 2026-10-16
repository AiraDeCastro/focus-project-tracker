/**
 * Ordering of the starred ("high priority") projects. Client-safe: no database code in here.
 *
 * The database keeps one number per project in `high_priority`: 0 means not starred, 1 or more
 * means starred, and the number is its place in the owner's ranking (1 is the top). Projects
 * starred before ranking existed all hold 1; ties are broken by repo id so the order is stable,
 * and the first move rewrites the ranks as 1, 2, 3 and so on.
 */

/** Names of the starred projects in ranking order, from rows of `[name, stored value, tie-break]`. */
export function rankedNames(rows: { name: string; stored: number; tie: number }[]): string[] {
  return rows
    .filter((r) => r.stored > 0)
    .sort((a, b) => a.stored - b.stored || a.tie - b.tie)
    .map((r) => r.name);
}

/**
 * The ranking after moving `name` up or down past the next project that can be moved, or null
 * when `name` is not in it. Projects that cannot be moved (the focus project, which the dashboard
 * shows apart, or a finished one) are stepped over and keep their places in the list. Moving the
 * top one up, or the bottom one down, changes nothing and returns the same order.
 */
export function moveInRanking(
  order: string[],
  name: string,
  direction: "up" | "down",
  canMove: (name: string) => boolean = () => true,
): string[] | null {
  const index = order.indexOf(name);
  if (index === -1) return null;
  const step = direction === "up" ? -1 : 1;
  let target = index + step;
  while (target >= 0 && target < order.length && !canMove(order[target])) target += step;
  if (target < 0 || target >= order.length) return [...order];
  const next = [...order];
  next.splice(index, 1);
  next.splice(target, 0, name);
  return next;
}

/**
 * Gives every starred project a place 1, 2, 3... in its current order and clears the place of
 * the rest. Use it after a star is added or removed so the places have no gaps.
 */
export function normalizeRanks<T extends { highPriority: boolean; priorityRank?: number }>(
  projects: T[],
): T[] {
  const starred = projects
    .map((p, index) => ({ p, index }))
    .filter((x) => x.p.highPriority)
    .sort(
      (a, b) =>
        (a.p.priorityRank ?? Infinity) - (b.p.priorityRank ?? Infinity) || a.index - b.index,
    );
  const place = new Map(starred.map((x, i) => [x.p, i + 1]));
  return projects.map((p) => {
    const rank = place.get(p);
    if (rank === undefined) {
      const { priorityRank: _unused, ...rest } = p;
      void _unused;
      return rest as T;
    }
    return { ...p, priorityRank: rank };
  });
}
