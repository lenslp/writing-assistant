import { Suspense } from "react";
import { ArticleAnalysis } from "../components/ArticleAnalysis";

export const dynamic = "force-dynamic";

function ArticleAnalysisFallback() {
  return <div className="p-8 text-sm text-muted-foreground">正在加载爆文分析...</div>;
}

export default function Page() {
  return (
    <Suspense fallback={<ArticleAnalysisFallback />}>
      <ArticleAnalysis />
    </Suspense>
  );
}
