import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { ArticleAnalysis } from "../components/ArticleAnalysis";
import { buildArticleAnalysisFromHotTopic } from "../lib/article-analysis";
import { ARTICLE_ANALYSIS_CACHE_TAG, HOT_TOPICS_CACHE_TAG, getHotTopicsSnapshot } from "../lib/hot-topic-refresh";

export const dynamic = "force-dynamic";

function ArticleAnalysisFallback() {
  return <div className="p-8 text-sm text-gray-500">正在加载爆文分析...</div>;
}

const getInitialArticleAnalysis = unstable_cache(
  async () => {
    const payload = await getHotTopicsSnapshot(20);

    return {
      items: payload.items.map(buildArticleAnalysisFromHotTopic),
      source: payload.source,
    } as const;
  },
  ["article-analysis-page-initial"],
  {
    revalidate: 60,
    tags: [HOT_TOPICS_CACHE_TAG, ARTICLE_ANALYSIS_CACHE_TAG],
  },
);

export default async function Page() {
  const initialData = await getInitialArticleAnalysis();

  return (
    <Suspense fallback={<ArticleAnalysisFallback />}>
      <ArticleAnalysis initialData={initialData} />
    </Suspense>
  );
}
