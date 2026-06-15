import { NextResponse } from "next/server";
import { readAppConfig, upsertAppConfig } from "../../lib/app-config-db";
import { hasPersistenceBackend } from "../../lib/persistence";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ item: null, persisted: false });
  }

  try {
    const item = await readAppConfig();
    return NextResponse.json({ item, persisted: true });
  } catch (error) {
    console.error("Failed to read app config:", error);
    return NextResponse.json({ item: null, persisted: false });
  }
}

export async function PATCH(request: Request) {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ item: null, persisted: false });
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
    return NextResponse.json({ item: null, persisted: false, message: "配置已保存在本地，远端同步暂不可用。" });
  }
}
