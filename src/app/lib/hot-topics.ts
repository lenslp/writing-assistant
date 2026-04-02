export type HotTopicItem = {
  id: string;
  title: string;
  source: string;
  sourceType: string;
  heat: number;
  trend: string;
  time: string;
  tags: string[];
  url?: string;
  summary?: string;
  fetchedAt: string;
};

export const fallbackHotTopics: HotTopicItem[] = [];

export function formatFetchedTime(iso: string) {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const hours = Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
  const minutes = Math.max(0, Math.floor(diff / (1000 * 60)));

  if (hours >= 24) {
    return `${Math.floor(hours / 24)} 天前`;
  }

  if (hours >= 1) {
    return `${hours} 小时前`;
  }

  return `${Math.max(1, minutes)} 分钟前`;
}

export function normalizeTrend(score: number) {
  return `+${Math.max(8, Math.min(98, score))}%`;
}

const CORE_SOURCE_PRIORITY = ["微博", "知乎", "抖音", "百度", "今日头条"] as const;

function sortSources(left: string, right: string) {
  const leftPriority = CORE_SOURCE_PRIORITY.indexOf(left as typeof CORE_SOURCE_PRIORITY[number]);
  const rightPriority = CORE_SOURCE_PRIORITY.indexOf(right as typeof CORE_SOURCE_PRIORITY[number]);

  if (leftPriority === -1 && rightPriority === -1) {
    return left.localeCompare(right, "zh-CN");
  }

  if (leftPriority === -1) return 1;
  if (rightPriority === -1) return -1;
  return leftPriority - rightPriority;
}

export function pickTopHotTopicsPerSource<T extends { source: string; heat: number }>(
  items: T[],
  perSourceLimit: number,
) {
  const grouped = new Map<string, T[]>();

  items.forEach((item) => {
    const group = grouped.get(item.source) ?? [];
    group.push(item);
    grouped.set(item.source, group);
  });

  return Array.from(grouped.entries())
    .sort(([leftSource], [rightSource]) => sortSources(leftSource, rightSource))
    .flatMap(([, group]) =>
      [...group]
        .sort((left, right) => right.heat - left.heat)
        .slice(0, perSourceLimit),
    );
}

export function pickDiverseHotTopics<T extends { source: string; heat: number }>(
  items: T[],
  limit: number,
  perSourceSoftLimit = 5,
) {
  const grouped = new Map<string, T[]>();

  items.forEach((item) => {
    const group = grouped.get(item.source) ?? [];
    group.push(item);
    grouped.set(item.source, group);
  });

  grouped.forEach((group, source) => {
    grouped.set(
      source,
      [...group].sort((left, right) => right.heat - left.heat),
    );
  });

  const selected: T[] = [];
  const sourceKeys = Array.from(grouped.keys()).sort((left, right) => {
    const leftTop = grouped.get(left)?.[0]?.heat ?? 0;
    const rightTop = grouped.get(right)?.[0]?.heat ?? 0;
    return rightTop - leftTop;
  });

  let addedInRound = true;

  while (selected.length < limit && addedInRound) {
    addedInRound = false;

    for (const source of sourceKeys) {
      const group = grouped.get(source) ?? [];
      if (!group.length) continue;

      const pickedFromSource = selected.filter((item) => item.source === source).length;
      if (pickedFromSource >= perSourceSoftLimit) continue;

      const next = group.shift();
      if (!next) continue;

      selected.push(next);
      addedInRound = true;

      if (selected.length >= limit) {
        break;
      }
    }
  }

  if (selected.length < limit) {
    const remaining = Array.from(grouped.values())
      .flat()
      .sort((left, right) => right.heat - left.heat);

    for (const item of remaining) {
      selected.push(item);
      if (selected.length >= limit) break;
    }
  }

  return selected.slice(0, limit);
}
