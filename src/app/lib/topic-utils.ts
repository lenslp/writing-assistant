type TopicLike = {
  title: string;
  source: string;
};

export function normalizeTopicTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function normalizeTopicSource(source: string) {
  return source.split(" · ")[0]?.trim() ?? source.trim();
}

export function buildTopicIdentityKey(topic: TopicLike) {
  return `${normalizeTopicSource(topic.source)}:${normalizeTopicTitle(topic.title)}`;
}

export function buildTopicSuggestionId(source: string, title: string) {
  return `hot-${buildTopicIdentityKey({ source, title })}`;
}
