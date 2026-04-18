import { NextResponse } from "next/server";
import { hasPersistenceBackend } from "../../lib/persistence";
import { hasDatabaseUrl, prisma } from "../../lib/prisma";
import { getSupabaseAdmin } from "../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ items: [], persisted: false });
  }

  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "10", 10);

  try {
    if (!hasDatabaseUrl()) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("fetch_jobs")
        .select("id,status,source,inserted_count,message,created_at,finished_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return NextResponse.json({
        items: (data ?? []).map((item) => ({
          id: item.id,
          status: item.status,
          source: item.source,
          insertedCount: item.inserted_count,
          message: item.message,
          createdAt: item.created_at,
          finishedAt: item.finished_at,
        })),
        persisted: true,
      });
    }

    const items = await prisma.fetchJob.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: limit,
    });

    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        status: item.status,
        source: item.source,
        insertedCount: item.insertedCount,
        message: item.message,
        createdAt: item.createdAt.toISOString(),
        finishedAt: item.finishedAt?.toISOString(),
      })),
      persisted: true,
    });
  } catch (error) {
    console.error("Failed to read fetch jobs:", error);
    return NextResponse.json({ items: [], persisted: false });
  }
}
