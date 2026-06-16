import { NextResponse } from "next/server";
import { testAIImageProviderConnection } from "../../../lib/ai-image";
import { requireAuthenticatedUser } from "../../../lib/api-auth";
import { toPublicErrorMessage } from "../../../lib/public-error";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  try {
    const result = await testAIImageProviderConnection(auth.user.id);

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      message: "图片模型连接测试通过。",
    });
  } catch (error) {
    console.error("Failed to test AI image provider:", error);
    return NextResponse.json(
      {
        ok: false,
        message: toPublicErrorMessage(error, "图片模型连接测试失败。"),
      },
      { status: 500 },
    );
  }
}
