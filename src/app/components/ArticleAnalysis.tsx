"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye, Heart, MessageCircle, BookOpen, Copy,
  Lightbulb, BarChart3, Type, AlignLeft, Sparkles, Zap, DatabaseZap,
  LoaderCircle,
} from "lucide-react";
import { useAppStore } from "../providers/app-store";
import { type ArticleAnalysisItem } from "../lib/article-analysis";
import { Skeleton } from "./ui/skeleton";

type ApiState = {
  items: ArticleAnalysisItem[];
  source: "database" | "live";
};

type ArticleAnalysisInitialData = ApiState;

const analysisLoadingStages = ["读取热点样本", "生成拆解视图", "整理可复用结论"];
const showDevDiagnostics = process.env.NODE_ENV !== "production";
const ARTICLE_ANALYSIS_CACHE_KEY = "wechat-writer:article-analysis:view-cache";
const ARTICLE_ANALYSIS_CACHE_TTL_MS = 5 * 60 * 1000;

type ArticleAnalysisCachePayload = ApiState & {
  cachedAt: number;
};

function readArticleAnalysisCache() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(ARTICLE_ANALYSIS_CACHE_KEY);
    if (!raw) return null;

    const payload = JSON.parse(raw) as ArticleAnalysisCachePayload;
    if (!Array.isArray(payload.items) || !payload.items.length) return null;

    return payload;
  } catch {
    return null;
  }
}

function writeArticleAnalysisCache(payload: ApiState) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      ARTICLE_ANALYSIS_CACHE_KEY,
      JSON.stringify({
        ...payload,
        cachedAt: Date.now(),
      } satisfies ArticleAnalysisCachePayload),
    );
  } catch {
    // ignore cache write errors
  }
}

function ArticleAnalysisLoadingShell() {
  return (
    <div className="lens-page space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28 rounded-lg bg-primary/10" />
          <Skeleton className="h-4 w-80 rounded-lg bg-muted" />
        </div>
        <div className="rounded-2xl border border-border/70 bg-[var(--surface-strong)] px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-[13px] text-primary" style={{ fontWeight: 700 }}>
            <LoaderCircle className="h-4 w-4 animate-spin" />
            爆文拆解生成中
          </div>
          <div className="mt-1.5 text-[12px] text-muted-foreground">正在根据真实热点生成结构、节奏和情绪点分析。</div>
        </div>
      </div>

      <div className="lens-card p-4">
        <div className="grid gap-3 md:grid-cols-3">
          {analysisLoadingStages.map((stage, index) => (
            <div key={stage} className="rounded-2xl border border-border/70 bg-background p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] ${
                  index === 0 ? "bg-primary text-white" : "bg-card text-muted-foreground"
                }`} style={{ fontWeight: 600 }}>
                  {index + 1}
                </div>
                <div className="text-[12px] text-foreground/75" style={{ fontWeight: 600 }}>{stage}</div>
              </div>
              <Skeleton className="mt-3 h-2.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-5">
        <div className="w-[340px] flex-shrink-0 rounded-[22px] border border-border bg-card/90">
          <div className="border-b border-border/70 px-4 py-3">
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
          <div className="divide-y divide-border/70">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`analysis-item-${index}`} className="space-y-3 px-4 py-4">
                <Skeleton className="h-4 w-[86%] rounded-md" />
                <Skeleton className="h-3 w-20 rounded-md" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-24 rounded-md" />
                  <div className="flex gap-2">
                    <Skeleton className="h-3 w-10 rounded-md" />
                    <Skeleton className="h-3 w-10 rounded-md" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div className="rounded-[22px] border border-border bg-card/90 p-5">
            <Skeleton className="h-6 w-[72%] rounded-md" />
            <div className="mt-3 flex gap-3">
              <Skeleton className="h-4 w-20 rounded-md" />
              <Skeleton className="h-4 w-20 rounded-md" />
              <Skeleton className="h-4 w-24 rounded-md" />
            </div>
            <Skeleton className="mt-4 h-10 w-full rounded-xl" />
            <Skeleton className="mt-3 h-16 w-full rounded-xl" />
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={`top-card-${index}`} className="rounded-[18px] border border-border bg-card/90 p-4">
                <Skeleton className="h-5 w-32 rounded-md" />
                <div className="mt-4 space-y-3">
                  {Array.from({ length: 3 }).map((__, rowIndex) => (
                    <Skeleton key={`top-card-${index}-row-${rowIndex}`} className="h-4 w-full rounded-md" />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[18px] border border-border bg-card/90 p-4">
            <Skeleton className="h-5 w-28 rounded-md" />
            <div className="mt-4 flex gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`rhythm-${index}`} className="flex-1 rounded-lg bg-background p-3">
                  <Skeleton className="h-4 w-12 rounded-md mx-auto" />
                  <Skeleton className="mt-2 h-3 w-14 rounded-md mx-auto" />
                  <Skeleton className="mt-2 h-5 w-16 rounded-full mx-auto" />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={`bottom-card-${index}`} className="rounded-[18px] border border-border bg-card/90 p-4">
                <Skeleton className="h-5 w-28 rounded-md" />
                <div className="mt-4 space-y-3">
                  {Array.from({ length: 4 }).map((__, rowIndex) => (
                    <Skeleton key={`bottom-card-${index}-row-${rowIndex}`} className="h-4 w-full rounded-md" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ArticleAnalysis({ initialData }: { initialData?: ArticleAnalysisInitialData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectTopic, upsertTopic, generateDraftFromTopic, updateDraft } = useAppStore();
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string>(searchParams.get("articleId") ?? "");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(!(initialData?.items?.length));
  const [apiState, setApiState] = useState<ApiState>(initialData ?? { items: [], source: "live" });

  const loadArticles = useCallback(async (background = false) => {
    if (!background) {
      setIsLoading(true);
    }
    setError("");

    try {
      const response = await fetch("/api/article-analysis", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load article analysis items: ${response.status}`);
      }
      const payload = await response.json();

      const nextState = {
        items: Array.isArray(payload.items) ? payload.items : [],
        source: payload.source === "database" ? "database" : "live",
      } satisfies ApiState;

      setApiState(nextState);
      if (nextState.items.length) {
        writeArticleAnalysisCache(nextState);
      }
    } catch (loadError) {
      console.error("Failed to load article analysis items:", loadError);
      if (!background) {
        setApiState({ items: [], source: "live" });
        setError("爆文分析数据加载失败，请稍后重试");
      }
    } finally {
      if (!background) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const cachedPayload = readArticleAnalysisCache();
    const hasFreshCache = Boolean(cachedPayload && Date.now() - cachedPayload.cachedAt <= ARTICLE_ANALYSIS_CACHE_TTL_MS);
    const hasInitialData = Boolean(initialData?.items?.length);

    if (hasInitialData) {
      writeArticleAnalysisCache(initialData ?? { items: [], source: "live" });
    }

    if (cachedPayload) {
      setApiState({
        items: cachedPayload.items,
        source: cachedPayload.source,
      });
      setIsLoading(false);
    }

    if (hasFreshCache) {
      void loadArticles(true);
      return;
    }

    void loadArticles(Boolean(cachedPayload || hasInitialData));
  }, [initialData, loadArticles]);

  const filteredArticles = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return apiState.items;

    return apiState.items.filter(
      (article) =>
        article.title.toLowerCase().includes(query) ||
        article.source.toLowerCase().includes(query) ||
        article.angle.toLowerCase().includes(query) ||
        article.tags.some((tag) => tag.toLowerCase().includes(query)),
    );
  }, [apiState.items, keyword]);

  useEffect(() => {
    const articleId = searchParams.get("articleId");
    if (articleId) {
      setSelectedId(articleId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (filteredArticles.some((article) => article.id === selectedId)) return;
    setSelectedId(filteredArticles[0]?.id ?? "");
  }, [filteredArticles, selectedId]);

  const selectedArticle = filteredArticles.find((article) => article.id === selectedId) ?? null;

  const handleGenerateFramework = () => {
    if (!selectedArticle) return;

    const topic = upsertTopic(selectedArticle.topic);
    selectTopic(topic.id);
    const generatedDraft = generateDraftFromTopic(topic.id, "body");
    const analysis = selectedArticle.analysis;

    updateDraft(generatedDraft.id, {
      title: `仿写拆解｜${selectedArticle.title}`,
      summary: `基于实时热点《${selectedArticle.title}》提炼的仿写框架：用 ${analysis.titleStructure.pattern} 的标题结构切入，再围绕「${selectedArticle.angle}」展开正文。`,
      outline: [
        `开头：用 ${analysis.titleStructure.hook} 承接这条热点的冲突与背景`,
        `中段：围绕「${selectedArticle.angle}」展开案例、判断和读者影响`,
        `节奏：按照 ${analysis.rhythm.map((item) => item.section).join(" / ")} 铺陈`,
        `结尾：用「${analysis.methods[3]}」作为收束动作`,
      ],
      body: [
        `这条热点《${selectedArticle.title}》之所以值得拆，不只是因为它热，而是因为它同时具备“传播性”和“可延展表达”两个特征。`,
        `如果你想写出更像公众号爆款的文章，核心不是照搬标题，而是把它的结构拆出来：先用 ${analysis.titleStructure.hook} 抓住注意力，再围绕「${selectedArticle.angle}」逐步建立判断。`,
        `这类文章最适合的写法，是开头先把读者拉进情境，中段拆出变化与影响，再给出具体建议。你可以优先从 ${selectedArticle.topic.angles[0]} 这个角度下手，让文章更贴近目标读者。`,
        `写作过程中，建议按照 ${analysis.rhythm.map((item) => item.section).join("—")} 的顺序组织内容，并保留 ${analysis.format.slice(0, 2).join("、")} 这类排版动作，让阅读节奏更清晰。`,
        `最后别忘了给读者一个明确判断：这条热点意味着什么、现在该怎么理解、接下来可以做什么。这样文章才能从“追热点”升级成“有观点的内容资产”。`,
      ].join("\n\n"),
      status: "待修改",
    });
    router.push(`/writing?draftId=${generatedDraft.id}`);
  };

  const handleExtractTopic = () => {
    if (!selectedArticle) return;

    const topic = upsertTopic(selectedArticle.topic);
    selectTopic(topic.id);
    router.push(`/topic-center?topicId=${topic.id}`);
  };

  const handleCopyInsights = async () => {
    if (!selectedArticle) return;

    const analysis = selectedArticle.analysis;
    await navigator.clipboard.writeText(
      [
        `标题：${selectedArticle.title}`,
        `拆解角度：${selectedArticle.angle}`,
        `标题结构：${analysis.titleStructure.pattern}`,
        `标题钩子：${analysis.titleStructure.hook}`,
        `开头方式：${analysis.opening}`,
        `可借鉴方法：${analysis.methods.join("；")}`,
      ].join("\n"),
    );
    setNotice("拆解要点已复制");
    window.setTimeout(() => setNotice(""), 1800);
  };

  if (isLoading) {
    return <ArticleAnalysisLoadingShell />;
  }

  if (!apiState.items.length) {
    return (
      <div className="mx-auto max-w-[920px] py-16">
        <div className="lens-card px-6 py-14 text-center">
          <div className="text-[18px] text-foreground" style={{ fontWeight: 750 }}>暂时还没有可分析的真实热点</div>
          <div className="mt-2 text-[13px] text-muted-foreground">
            先去热点中心抓取一次数据，抓到真实热点后这里会自动生成对应的爆文拆解视图。
          </div>
          {error ? <div className="text-[12px] text-red-500 mt-3">{error}</div> : null}
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => router.push("/hot-topics")}
              className="lens-btn-primary px-4 py-2 text-[13px]"
            >
              去抓热点
            </button>
            <button
              onClick={() => void loadArticles()}
              className="lens-btn-secondary px-4 py-2 text-[13px]"
            >
              重新加载
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedArticle) {
    return null;
  }

  const analysis = selectedArticle.analysis;

  return (
    <div className="lens-page space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="lens-title text-[20px]">爆文分析</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">基于真实热点生成拆解视图，快速提炼可复用的公众号写法</p>
        </div>
        <div className="flex items-center gap-3">
          {showDevDiagnostics ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card/90 px-3 py-1.5 text-[12px] text-muted-foreground">
              <DatabaseZap className="h-3.5 w-3.5 text-primary" />
              {apiState.source === "database" ? "来自数据库热点" : "来自实时抓取"}
            </div>
          ) : null}
          {notice ? <span className="text-[12px] text-primary">{notice}</span> : null}
        </div>
      </div>

      <div className="flex gap-5">
        <div className="w-[340px] flex-shrink-0 rounded-[22px] border border-border bg-card/90">
          <div className="border-b border-border/70 px-4 py-3">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              type="text"
              placeholder="搜索爆文..."
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:bg-card"
            />
          </div>
          <div className="max-h-[calc(100vh-220px)] divide-y divide-border/70 overflow-y-auto">
            {filteredArticles.map((article) => (
              <div
                key={article.id}
                onClick={() => setSelectedId(article.id)}
                className={`cursor-pointer border-l-2 px-4 py-3.5 transition-colors ${
                  selectedArticle.id === article.id ? "border-l-primary bg-primary/10" : "border-l-transparent hover:bg-background"
                }`}
              >
                <div className="text-[13px] text-foreground" style={{ fontWeight: selectedArticle.id === article.id ? 750 : 600 }}>{article.title}</div>
                <div className="mt-1 text-[11px] text-primary">{article.angle}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-muted-foreground">{article.source} · {article.time}</span>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" />{article.metrics.reads}</span>
                    <span className="flex items-center gap-0.5"><Heart className="w-3 h-3" />{article.metrics.likes}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div className="rounded-[22px] border border-border bg-card/90 p-5 shadow-[0_12px_36px_rgba(31,41,86,0.05)]">
            <h2 className="text-[16px] text-foreground" style={{ fontWeight: 750 }}>{selectedArticle.title}</h2>
            <div className="mt-2 flex items-center gap-4 text-[12px] text-muted-foreground">
              <span>{selectedArticle.source}</span>
              <span>{selectedArticle.time}</span>
              <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{selectedArticle.metrics.reads}</span>
              <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" />{selectedArticle.metrics.likes}</span>
              <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{selectedArticle.metrics.comments}</span>
            </div>
            <div className="mt-2 text-[12px] text-muted-foreground">
              传播指标基于真实热点热度折算，用于辅助判断仿写优先级。
            </div>
            <div className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-[12px] text-muted-foreground">
              适合提炼为：<span className="text-primary" style={{ fontWeight: 750 }}>{selectedArticle.topic.title}</span>
            </div>
            {selectedArticle.summary ? (
              <div className="mt-3 rounded-lg bg-background px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                {selectedArticle.summary}
              </div>
            ) : null}
            <div className="flex items-center gap-2 mt-3">
              <button onClick={handleGenerateFramework} className="lens-btn-primary flex items-center gap-1.5 px-3.5 py-1.5 text-[12px]" style={{ fontWeight: 750 }}>
                <Copy className="w-3.5 h-3.5" /> 生成仿写框架
              </button>
              <button onClick={handleExtractTopic} className="lens-btn-secondary flex items-center gap-1.5 px-3.5 py-1.5 text-[12px]" style={{ fontWeight: 750 }}>
                <Lightbulb className="w-3.5 h-3.5" /> 提炼选题角度
              </button>
              <button onClick={handleCopyInsights} className="lens-btn-secondary flex items-center gap-1.5 px-3.5 py-1.5 text-[12px]" style={{ fontWeight: 750 }}>
                <Zap className="w-3.5 h-3.5" /> 复制拆解要点
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[18px] border border-border bg-card/90 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Type className="h-4 w-4 text-primary" />
                <span className="text-[13px] text-foreground" style={{ fontWeight: 750 }}>标题结构分析</span>
              </div>
              <div className="space-y-2.5">
                {Object.entries(analysis.titleStructure).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-14 text-[11px] text-muted-foreground">{key === "pattern" ? "模式" : key === "hook" ? "钩子" : "情绪"}</span>
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-[12px] text-primary" style={{ fontWeight: 700 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[18px] border border-border bg-card/90 p-4">
              <div className="mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-[13px] text-foreground" style={{ fontWeight: 750 }}>开头方式分析</span>
              </div>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">{analysis.opening}</p>
            </div>
          </div>

          <div className="rounded-[18px] border border-border bg-card/90 p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlignLeft className="h-4 w-4 text-primary" />
              <span className="text-[13px] text-foreground" style={{ fontWeight: 750 }}>段落节奏分析</span>
            </div>
            <div className="flex items-center gap-2">
              {analysis.rhythm.map((item) => (
                <div key={item.section} className="flex-1 rounded-lg bg-background p-3 text-center">
                  <div className="text-[12px] text-foreground" style={{ fontWeight: 700 }}>{item.section}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{item.length}</div>
                  <div className="mt-1.5 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{item.style}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[18px] border border-border bg-card/90 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-[13px] text-foreground" style={{ fontWeight: 750 }}>情绪点分析</span>
              </div>
              <div className="space-y-2.5">
                {analysis.emotions.map((emotion) => (
                  <div key={emotion.point} className="flex items-center gap-3">
                    <span className="w-16 flex-shrink-0 text-[12px] text-foreground" style={{ fontWeight: 650 }}>{emotion.point}</span>
                    <div className="h-2 flex-1 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${emotion.intensity}%` }} />
                    </div>
                    <span className="w-8 text-[11px] text-muted-foreground">{emotion.intensity}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[18px] border border-border bg-card/90 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-[13px] text-foreground" style={{ fontWeight: 750 }}>可借鉴方法</span>
              </div>
              <div className="space-y-2">
                {analysis.methods.map((method, index) => (
                  <div key={method} className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-primary/10 text-[11px] text-primary" style={{ fontWeight: 700 }}>{index + 1}</span>
                    {method}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[18px] border border-border bg-card/90 p-4">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="text-[13px] text-foreground" style={{ fontWeight: 750 }}>排版特征总结</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {analysis.format.map((item) => (
                <span key={item} className="rounded-full bg-primary/10 px-3 py-1 text-[12px] text-primary" style={{ fontWeight: 700 }}>{item}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
