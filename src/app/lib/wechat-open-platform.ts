import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { prisma, hasDatabaseUrl } from "./prisma";

const WECHAT_API_BASE = "https://api.weixin.qq.com";
const WECHAT_MP_BASE = "https://mp.weixin.qq.com";
const AUTH_STATE_TTL_MS = 10 * 60 * 1000;

type WechatApiError = {
  errcode?: number;
  errmsg?: string;
};

type QueryAuthResponse = {
  authorization_info?: {
    authorizer_appid?: string;
    authorizer_access_token?: string;
    expires_in?: number;
    authorizer_refresh_token?: string;
  };
};

type AuthorizerInfoResponse = {
  authorizer_info?: {
    nick_name?: string;
    head_img?: string;
    principal_name?: string;
    service_type_info?: { id?: number };
    verify_type_info?: { id?: number };
  };
};

type RefreshTokenResponse = {
  authorizer_access_token?: string;
  expires_in?: number;
  authorizer_refresh_token?: string;
};

function getEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function getWechatOpenPlatformConfig() {
  return {
    componentAppId: getEnv("WECHAT_OPEN_COMPONENT_APP_ID"),
    componentAppSecret: getEnv("WECHAT_OPEN_COMPONENT_APP_SECRET"),
    componentVerifyTicket: getEnv("WECHAT_OPEN_COMPONENT_VERIFY_TICKET"),
    redirectUri: getEnv("WECHAT_OPEN_AUTH_REDIRECT_URI"),
    stateSecret: getEnv("WECHAT_OPEN_AUTH_STATE_SECRET") || getEnv("NEXTAUTH_SECRET") || getEnv("CRON_SECRET"),
  };
}

async function readComponentVerifyTicket(componentAppId: string) {
  if (hasDatabaseUrl()) {
    const record = await prisma.wechatComponentTicket.findUnique({
      where: { componentAppId },
    });
    if (record?.verifyTicket) return record.verifyTicket;
  }

  return getWechatOpenPlatformConfig().componentVerifyTicket;
}

export function hasWechatOpenPlatformConfig() {
  const config = getWechatOpenPlatformConfig();
  return Boolean(config.componentAppId && config.componentAppSecret && config.redirectUri && config.stateSecret);
}

function formatWechatApiError(payload: WechatApiError, fallback: string) {
  if (typeof payload.errcode === "number" && payload.errcode !== 0) {
    return `微信接口错误 ${payload.errcode}${payload.errmsg ? `：${payload.errmsg}` : ""}`;
  }

  return fallback;
}

async function fetchWechatJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as (T & WechatApiError) | null;

  if (!response.ok) {
    throw new Error(payload ? formatWechatApiError(payload, `微信接口请求失败：${response.status}`) : `微信接口请求失败：${response.status}`);
  }

  if (payload && typeof payload.errcode === "number" && payload.errcode !== 0) {
    throw new Error(formatWechatApiError(payload, "微信接口请求失败"));
  }

  if (!payload) {
    throw new Error("微信接口返回为空。");
  }

  return payload;
}

function signState(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createWechatAuthState(userId: string) {
  const { stateSecret } = getWechatOpenPlatformConfig();
  if (!stateSecret) {
    throw new Error("缺少 WECHAT_OPEN_AUTH_STATE_SECRET，无法生成微信授权状态。");
  }

  const payload = Buffer.from(JSON.stringify({
    userId,
    expiresAt: Date.now() + AUTH_STATE_TTL_MS,
    nonce: randomBytes(12).toString("base64url"),
  })).toString("base64url");
  return `${payload}.${signState(payload, stateSecret)}`;
}

export function verifyWechatAuthState(state: string) {
  const { stateSecret } = getWechatOpenPlatformConfig();
  if (!stateSecret) {
    throw new Error("缺少 WECHAT_OPEN_AUTH_STATE_SECRET，无法校验微信授权状态。");
  }

  const [payload, signature] = state.split(".");
  if (!payload || !signature) {
    throw new Error("微信授权状态无效。");
  }

  const expected = signState(payload, stateSecret);
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("微信授权状态签名无效。");
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    userId?: unknown;
    expiresAt?: unknown;
  };

  if (typeof parsed.userId !== "string" || !parsed.userId) {
    throw new Error("微信授权状态缺少用户信息。");
  }

  if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) {
    throw new Error("微信授权状态已过期，请重新发起授权。");
  }

  return {
    userId: parsed.userId,
  };
}

export async function getComponentAccessToken() {
  const config = getWechatOpenPlatformConfig();
  if (!config.componentAppId || !config.componentAppSecret) {
    throw new Error("微信第三方平台参数未配置，请补充 component appid/appsecret 与 verify ticket。");
  }
  const componentVerifyTicket = await readComponentVerifyTicket(config.componentAppId);
  if (!componentVerifyTicket) {
    throw new Error("微信第三方平台 verify ticket 未收到，请先配置授权事件接收 URL 并等待微信推送。");
  }

  const payload = await fetchWechatJson<{ component_access_token?: string; expires_in?: number }>(
    `${WECHAT_API_BASE}/cgi-bin/component/api_component_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        component_appid: config.componentAppId,
        component_appsecret: config.componentAppSecret,
        component_verify_ticket: componentVerifyTicket,
      }),
    },
  );

  if (!payload.component_access_token) {
    throw new Error("微信未返回 component_access_token。");
  }

  return payload.component_access_token;
}

export async function saveWechatComponentVerifyTicket(input: {
  componentAppId: string;
  verifyTicket: string;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("数据库未配置，无法保存微信 component_verify_ticket。");
  }

  await prisma.wechatComponentTicket.upsert({
    where: { componentAppId: input.componentAppId },
    create: {
      componentAppId: input.componentAppId,
      verifyTicket: input.verifyTicket,
    },
    update: {
      verifyTicket: input.verifyTicket,
      receivedAt: new Date(),
    },
  });
}

export function verifyWechatComponentCallbackToken(request: Request) {
  const token = getEnv("WECHAT_OPEN_CALLBACK_TOKEN");
  if (!token) {
    throw new Error("缺少 WECHAT_OPEN_CALLBACK_TOKEN，无法接收微信授权事件。");
  }

  const url = new URL(request.url);
  const receivedToken = url.searchParams.get("token")?.trim() ?? "";
  if (!receivedToken || receivedToken !== token) {
    throw new Error("微信授权事件 token 无效。");
  }
}

export async function parseWechatComponentEvent(request: Request) {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    throw new Error("微信授权事件为空。");
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  });
  const parsed = parser.parse(rawBody) as {
    xml?: Record<string, unknown>;
  };
  const root = parsed.xml ?? {};
  const componentAppId = typeof root.AppId === "string" ? root.AppId.trim() : "";
  const infoType = typeof root.InfoType === "string" ? root.InfoType.trim() : "";
  const verifyTicket = typeof root.ComponentVerifyTicket === "string" ? root.ComponentVerifyTicket.trim() : "";

  return {
    componentAppId,
    infoType,
    verifyTicket,
  };
}

export async function createWechatThirdPartyAuthorizeUrl(userId: string) {
  const config = getWechatOpenPlatformConfig();
  if (!config.componentAppId || !config.redirectUri) {
    throw new Error("微信第三方平台授权参数未配置，请补充 WECHAT_OPEN_COMPONENT_APP_ID 和 WECHAT_OPEN_AUTH_REDIRECT_URI。");
  }

  const componentAccessToken = await getComponentAccessToken();
  const preAuth = await fetchWechatJson<{ pre_auth_code?: string }>(
    `${WECHAT_API_BASE}/cgi-bin/component/api_create_preauthcode?component_access_token=${componentAccessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_appid: config.componentAppId }),
    },
  );

  if (!preAuth.pre_auth_code) {
    throw new Error("微信未返回 pre_auth_code。");
  }

  const search = new URLSearchParams({
    component_appid: config.componentAppId,
    pre_auth_code: preAuth.pre_auth_code,
    redirect_uri: config.redirectUri,
    auth_type: "3",
    biz_appid: "",
    state: createWechatAuthState(userId),
  });

  return `${WECHAT_MP_BASE}/cgi-bin/componentloginpage?${search.toString()}`;
}

export async function exchangeWechatAuthorizationCode(authCode: string) {
  const config = getWechatOpenPlatformConfig();
  if (!config.componentAppId) {
    throw new Error("微信第三方平台 component appid 未配置。");
  }

  const componentAccessToken = await getComponentAccessToken();
  const authPayload = await fetchWechatJson<QueryAuthResponse>(
    `${WECHAT_API_BASE}/cgi-bin/component/api_query_auth?component_access_token=${componentAccessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        component_appid: config.componentAppId,
        authorization_code: authCode,
      }),
    },
  );
  const authorization = authPayload.authorization_info;
  if (!authorization?.authorizer_appid || !authorization.authorizer_refresh_token) {
    throw new Error("微信授权返回缺少公众号授权信息。");
  }

  const infoPayload = await fetchWechatJson<AuthorizerInfoResponse>(
    `${WECHAT_API_BASE}/cgi-bin/component/api_get_authorizer_info?component_access_token=${componentAccessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        component_appid: config.componentAppId,
        authorizer_appid: authorization.authorizer_appid,
      }),
    },
  );
  const info = infoPayload.authorizer_info;

  return {
    authorizerAppId: authorization.authorizer_appid,
    authorizerAccessToken: authorization.authorizer_access_token ?? "",
    authorizerRefreshToken: authorization.authorizer_refresh_token,
    expiresIn: authorization.expires_in,
    nickName: info?.nick_name ?? "",
    avatarUrl: info?.head_img ?? "",
    principalName: info?.principal_name ?? "",
    serviceTypeInfo: info?.service_type_info?.id ?? null,
    verifyTypeInfo: info?.verify_type_info?.id ?? null,
  };
}

export async function refreshWechatAuthorizerToken(input: {
  authorizerAppId: string;
  authorizerRefreshToken: string;
}) {
  const config = getWechatOpenPlatformConfig();
  if (!config.componentAppId) {
    throw new Error("微信第三方平台 component appid 未配置。");
  }

  const componentAccessToken = await getComponentAccessToken();
  const payload = await fetchWechatJson<RefreshTokenResponse>(
    `${WECHAT_API_BASE}/cgi-bin/component/api_authorizer_token?component_access_token=${componentAccessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        component_appid: config.componentAppId,
        authorizer_appid: input.authorizerAppId,
        authorizer_refresh_token: input.authorizerRefreshToken,
      }),
    },
  );

  if (!payload.authorizer_access_token) {
    throw new Error("微信未返回 authorizer_access_token。");
  }

  return {
    authorizerAccessToken: payload.authorizer_access_token,
    authorizerRefreshToken: payload.authorizer_refresh_token,
    expiresIn: payload.expires_in ?? 7200,
  };
}
