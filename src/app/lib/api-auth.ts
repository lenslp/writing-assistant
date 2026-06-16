import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient, hasSupabaseBrowserEnv } from "./supabase";

type AuthResult =
  | { user: User; response?: never }
  | { user?: never; response: NextResponse };

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export async function requireAuthenticatedUser(request: Request): Promise<AuthResult> {
  if (!hasSupabaseBrowserEnv()) {
    return {
      response: NextResponse.json(
        { message: "认证服务未配置，无法访问受保护接口。" },
        { status: 503 },
      ),
    };
  }

  const token = readBearerToken(request);
  if (!token) {
    return {
      response: NextResponse.json(
        { message: "请先登录后再操作。" },
        { status: 401 },
      ),
    };
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return {
      response: NextResponse.json(
        { message: "登录状态已失效，请重新登录。" },
        { status: 401 },
      ),
    };
  }

  return { user: data.user };
}

