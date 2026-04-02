import { NextResponse } from "next/server";
import { ensureHotTopicsCache } from "../../lib/hot-topic-refresh";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "240", 10);

  try {
    const payload = await ensureHotTopicsCache(limit);

    return NextResponse.json({
      items: payload.items,
      source: payload.source,
      persisted: payload.persisted,
      restrictedCount: payload.restrictedCount,
      failedSources: payload.failedSources,
      refreshed: payload.refreshed,
      stale: payload.stale,
      ttlMs: payload.ttlMs,
      lastSuccessAt: payload.lastSuccessAt,
    });
  } catch (error) {
    console.error("Failed to load hot topics:", error);
    return NextResponse.json({
      items: [],
      source: "live",
      persisted: false,
    }, { status: 500 });
  }
}
