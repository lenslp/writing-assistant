import { unstable_cache } from "next/cache";
import { Dashboard } from "./components/Dashboard";
import { HOT_TOPICS_CACHE_TAG, getHotTopicsSnapshot } from "./lib/hot-topic-refresh";
import { formatFetchedTime } from "./lib/hot-topics";

const getDashboardHotTopics = unstable_cache(
  async () => {
    try {
      const payload = await getHotTopicsSnapshot(150);
      return payload.items.map((item) => ({
        ...item,
        time: "time" in item ? item.time : formatFetchedTime(item.fetchedAt),
      }));
    } catch (error) {
      console.error("Failed to preload dashboard hot topics:", error);
      return [];
    }
  },
  ["dashboard-hot-topics"],
  {
    revalidate: 60,
    tags: [HOT_TOPICS_CACHE_TAG],
  },
);

export default async function Page() {
  const initialHotTopics = await getDashboardHotTopics();
  return <Dashboard initialHotTopics={initialHotTopics} />;
}
