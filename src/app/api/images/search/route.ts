import { NextResponse } from "next/server";
import { searchRealArticleImages } from "../../../lib/real-image-search";
import { requireAuthenticatedUser } from "../../../lib/api-auth";
import { toPublicErrorMessage } from "../../../lib/public-error";

export const dynamic = "force-dynamic";

type Payload = {
  query?: string;
  title?: string;
  summary?: string;
  body?: string;
  domain?: string;
  source?: string;
};

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  try {
    const payload = (await request.json().catch(() => ({}))) as Payload;
    const results = await searchRealArticleImages({
      userId: auth.user.id,
      query: payload.query,
      title: payload.title,
      summary: payload.summary,
      body: payload.body,
      domain: payload.domain,
      source: payload.source,
      count: 10,
    });

    if (!results.length) {
      return NextResponse.json({
        url: "",
        results: [],
        source: "none",
        query: payload.query ?? "",
        message: "暂时没有找到合适的真实图片。",
      });
    }

    return NextResponse.json({
      url: results[0]?.url,
      results,
      source: results[0]?.source ?? "unsplash",
      query: results[0]?.query ?? payload.query ?? "",
    });
  } catch (error) {
    console.error("Failed to search real images:", error);
    return NextResponse.json(
      { message: toPublicErrorMessage(error, "联网搜图失败，请稍后再试。") },
      { status: 500 },
    );
  }
}
