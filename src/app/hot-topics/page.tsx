import { unstable_cache } from "next/cache";
import { HotTopics } from "../components/HotTopics";
import { HOT_TOPICS_CACHE_TAG, getHotTopicsSnapshot } from "../lib/hot-topic-refresh";
import { formatFetchedTime } from "../lib/hot-topics";

export const dynamic = "force-dynamic";

const getInitialHotTopics = unstable_cache(
  async () => {
    const payload = await getHotTopicsSnapshot(240);

    return {
      items: payload.items.map((item) => ({
        ...item,
        time: "time" in item ? item.time : formatFetchedTime(item.fetchedAt),
      })),
      source: payload.source,
      restrictedCount: payload.restrictedCount,
    };
  },
  ["hot-topics-page-initial"],
  {
    revalidate: 60,
    tags: [HOT_TOPICS_CACHE_TAG],
  },
);

export default async function Page() {
  const initialData = await getInitialHotTopics();

  return <HotTopics initialData={initialData} />;
}
