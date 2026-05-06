import { NextResponse } from "next/server";
import {
  deleteAIProviderConfig,
  readAIProviderConfig,
  setActiveAIProviderConfig,
  upsertAIProviderConfig,
} from "../../../lib/app-config-db";
import { hasPersistenceBackend } from "../../../lib/persistence";

export const dynamic = "force-dynamic";

type PatchPayload = {
  id?: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  fastModel?: string;
  longformModel?: string;
  setAsActive?: boolean;
  action?: "upsert" | "activate";
  profileId?: string;
};

export async function GET() {
  try {
    const config = await readAIProviderConfig();
    return NextResponse.json({ config, persisted: hasPersistenceBackend() });
  } catch (error) {
    console.error("Failed to read AI provider config:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "读取模型配置失败" },
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
    const config = payload.action === "activate"
      ? await setActiveAIProviderConfig(payload.profileId?.trim() ?? "")
      : await upsertAIProviderConfig({
          id: payload.id?.trim() ?? "",
          name: payload.name?.trim() ?? "",
          baseUrl: payload.baseUrl?.trim() ?? "",
          apiKey: payload.apiKey?.trim() ?? "",
          model: payload.model?.trim() ?? "",
          fastModel: payload.fastModel?.trim() ?? "",
          longformModel: payload.longformModel?.trim() ?? "",
          setAsActive: payload.setAsActive !== false,
        });

    return NextResponse.json({ config, persisted: true });
  } catch (error) {
    console.error("Failed to update AI provider config:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "保存模型配置失败" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "No persistence backend is configured" }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId")?.trim() ?? "";
    const config = await deleteAIProviderConfig(profileId || undefined);
    return NextResponse.json({ config, persisted: true });
  } catch (error) {
    console.error("Failed to delete AI provider config:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "删除模型配置失败" },
      { status: 500 },
    );
  }
}
