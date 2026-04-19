import { NextResponse } from "next/server";
import {
  deleteAIImageProviderConfig,
  readAIImageProviderConfig,
  upsertAIImageProviderConfig,
} from "../../../lib/app-config-db";
import { hasPersistenceBackend } from "../../../lib/persistence";

export const dynamic = "force-dynamic";

type PatchPayload = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
};

export async function GET() {
  try {
    const config = await readAIImageProviderConfig();
    return NextResponse.json({ config, persisted: hasPersistenceBackend() });
  } catch (error) {
    console.error("Failed to read AI image provider config:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "读取图片模型配置失败" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "No persistence backend is configured" }, { status: 500 });
  }

  try {
    const payload = (await request.json()) as PatchPayload;
    const config = await upsertAIImageProviderConfig({
      baseUrl: payload.baseUrl?.trim() ?? "",
      apiKey: payload.apiKey?.trim() ?? "",
      model: payload.model?.trim() ?? "",
    });

    return NextResponse.json({ config, persisted: true });
  } catch (error) {
    console.error("Failed to update AI image provider config:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "保存图片模型配置失败" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "No persistence backend is configured" }, { status: 500 });
  }

  try {
    const config = await deleteAIImageProviderConfig();
    return NextResponse.json({ config, persisted: true });
  } catch (error) {
    console.error("Failed to delete AI image provider config:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "删除图片模型配置失败" },
      { status: 500 },
    );
  }
}
