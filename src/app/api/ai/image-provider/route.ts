import { NextResponse } from "next/server";
import {
  deleteAIImageProviderConfig,
  readAIImageProviderConfig,
  setActiveAIImageProviderConfig,
  upsertAIImageProviderConfig,
} from "../../../lib/app-config-db";
import { requireAuthenticatedUser } from "../../../lib/api-auth";
import { toPublicErrorMessage } from "../../../lib/public-error";

export const dynamic = "force-dynamic";

type PatchPayload = {
  id?: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  setAsActive?: boolean;
};

type PostPayload = {
  profileId?: string;
};

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  try {
    const config = await readAIImageProviderConfig(auth.user.id);
    return NextResponse.json({ config, persisted: true });
  } catch (error) {
    console.error("Failed to read AI image provider config:", error);
    return NextResponse.json(
      { message: toPublicErrorMessage(error, "读取图片模型配置失败") },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  try {
    const payload = (await request.json()) as PatchPayload;
    const config = await upsertAIImageProviderConfig(auth.user.id, {
      id: payload.id?.trim() ?? "",
      name: payload.name?.trim() ?? "",
      baseUrl: payload.baseUrl?.trim() ?? "",
      apiKey: payload.apiKey?.trim() ?? "",
      model: payload.model?.trim() ?? "",
      setAsActive: payload.setAsActive,
    });

    return NextResponse.json({ config, persisted: true });
  } catch (error) {
    console.error("Failed to update AI image provider config:", error);
    return NextResponse.json(
      { message: toPublicErrorMessage(error, "保存图片模型配置失败") },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  try {
    const payload = (await request.json()) as PostPayload;
    const profileId = payload.profileId?.trim() ?? "";

    if (!profileId) {
      return NextResponse.json({ message: "缺少目标配置 ID" }, { status: 400 });
    }

    const config = await setActiveAIImageProviderConfig(auth.user.id, profileId);
    return NextResponse.json({ config, persisted: true });
  } catch (error) {
    console.error("Failed to set active AI image provider config:", error);
    return NextResponse.json(
      { message: toPublicErrorMessage(error, "切换默认图片模型配置失败") },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId")?.trim() ?? undefined;
    const config = await deleteAIImageProviderConfig(auth.user.id, profileId);
    return NextResponse.json({ config, persisted: true });
  } catch (error) {
    console.error("Failed to delete AI image provider config:", error);
    return NextResponse.json(
      { message: toPublicErrorMessage(error, "删除图片模型配置失败") },
      { status: 500 },
    );
  }
}
