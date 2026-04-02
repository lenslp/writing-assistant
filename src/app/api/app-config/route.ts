import { NextResponse } from "next/server";
import { readAppConfig, upsertAppConfig } from "../../lib/app-config-db";
import { hasDatabaseUrl } from "../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ item: null, persisted: false });
  }

  try {
    const item = await readAppConfig();
    return NextResponse.json({ item, persisted: true });
  } catch (error) {
    console.error("Failed to read app config:", error);
    return NextResponse.json({ item: null, persisted: false }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ message: "DATABASE_URL is not configured" }, { status: 500 });
  }

  try {
    const payload = await request.json();
    const patch = payload?.patch;

    if (!patch || typeof patch !== "object") {
      return NextResponse.json({ message: "Invalid app config patch" }, { status: 400 });
    }

    const item = await upsertAppConfig(patch);
    return NextResponse.json({ item, persisted: true });
  } catch (error) {
    console.error("Failed to update app config:", error);
    return NextResponse.json({ message: "Failed to update app config" }, { status: 500 });
  }
}
