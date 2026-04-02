import { NextResponse } from "next/server";
import { hasDatabaseUrl, prisma } from "../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ items: [], persisted: false });
  }

  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "10", 10);

  try {
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
    return NextResponse.json({ items: [], persisted: false }, { status: 500 });
  }
}
