import { NextResponse } from "next/server";
import {
  deleteAIProviderConfig,
  readAIProviderConfig,
  setActiveAIProviderConfig,
  upsertAIProviderConfig,
} from "../../../lib/app-config-db";
import type { AIProviderKind } from "../../../lib/app-config-db";

export const dynamic = "force-dynamic";

type PatchPayload = {
  id?: string;
  name?: string;
  providerType?: AIProviderKind;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  fastModel?: string;
  longformModel?: string;
  setAsActive?: boolean;
};

type PostPayload = {
  profileId?: string;
};

export async function GET() {
  try {
    const config = await readAIProviderConfig();
    return NextResponse.json({ config, persisted: true });
  } catch (error) {
    console.error("Failed to read AI provider config:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "读取模型配置失败" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as PatchPayload;
    const config = await upsertAIProviderConfig({
      id: payload.id?.trim() ?? "",
      name: payload.name?.trim() ?? "",
      providerType: payload.providerType,
      baseUrl: payload.baseUrl?.trim() ?? "",
      apiKey: payload.apiKey?.trim() ?? "",
      model: payload.model?.trim() ?? "",
      fastModel: payload.fastModel?.trim() ?? "",
      longformModel: payload.longformModel?.trim() ?? "",
      setAsActive: payload.setAsActive,
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

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as PostPayload;
    const profileId = payload.profileId?.trim() ?? "";

    if (!profileId) {
      return NextResponse.json({ message: "缺少目标配置 ID" }, { status: 400 });
    }

    const config = await setActiveAIProviderConfig(profileId);
    return NextResponse.json({ config, persisted: true });
  } catch (error) {
    console.error("Failed to set active AI provider config:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "切换默认模型配置失败" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId")?.trim() ?? undefined;
    const config = await deleteAIProviderConfig(profileId);
    return NextResponse.json({ config, persisted: true });
  } catch (error) {
    console.error("Failed to delete AI provider config:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "删除模型配置失败" },
      { status: 500 },
    );
  }
}
