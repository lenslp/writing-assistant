import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { hasDatabaseUrl } from "./prisma";
import { getSupabaseAdmin } from "./supabase-admin";
import { shouldUseSupabaseAdmin } from "./persistence";
import { defaultSettings, type AppSettings } from "./app-data";
import { resolveArticleDomain } from "./content-domains";
import { decryptSecret, encryptSecret } from "./secret-crypto";

const DEFAULT_AI_PROVIDER_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_AI_PROVIDER_MODEL = "qwen3.5-plus";
const ENV_AI_PROVIDER_PROFILE_ID = "environment-default";
const DEFAULT_AI_IMAGE_PROVIDER_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_AI_IMAGE_PROVIDER_MODEL = "gpt-image-1";
const ENV_AI_IMAGE_PROVIDER_PROFILE_ID = "environment-image-default";

type AppConfigRecord = {
  id: string;
  userId: string;
  settings: unknown;
  selectedTopicId: string | null;
  updatedAt: Date | string;
};

export type WechatOfficialAccountSecret = {
  id: string;
  name: string;
  appId: string;
  appSecret: string;
  authorizerAccessToken?: string;
  authorizerRefreshToken?: string;
  tokenExpiresAt?: string | null;
  defaultAuthor: string;
  contentSourceUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type WechatOfficialAccountSummary = {
  id: string;
  name: string;
  appId: string;
  appIdMasked: string;
  hasAppSecret: boolean;
  source?: "third-party" | "legacy";
  defaultAuthor: string;
  contentSourceUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type AIProviderKind = "openai" | "anthropic";

export type AIProviderSecret = {
  id: string;
  name: string;
  providerType: AIProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  fastModel: string;
  longformModel: string;
};

export type AIProviderSecretWithSource = AIProviderSecret & {
  source: AIProviderSummary["source"];
};

export type AIProviderProfileSummary = {
  id: string;
  name: string;
  providerType: AIProviderKind;
  baseUrl: string;
  model: string;
  fastModel: string;
  longformModel: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  isActive: boolean;
};

export type AIProviderSummary = {
  activeProfileId: string | null;
  activeProfile: AIProviderProfileSummary | null;
  profiles: AIProviderProfileSummary[];
  source: "user" | "platform" | "default";
};

type AIProviderCollectionSecret = {
  activeProfileId: string | null;
  profiles: AIProviderSecret[];
};

export type AIImageProviderSecret = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type AIImageProviderSecretWithSource = AIImageProviderSecret & {
  source: AIImageProviderSummary["source"];
};

export type AIImageProviderProfileSummary = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  isActive: boolean;
};

export type AIImageProviderSummary = {
  activeProfileId: string | null;
  activeProfile: AIImageProviderProfileSummary | null;
  profiles: AIImageProviderProfileSummary[];
  source: "user" | "platform" | "default";
};

type AIImageProviderCollectionSecret = {
  activeProfileId: string | null;
  profiles: AIImageProviderSecret[];
};

function normalizeStringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

function normalizeAIProviderBaseUrl(baseUrl: string) {
  return baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/messages$/i, "");
}

function normalizeAIProviderKind(value: string | undefined | null, baseUrl = ""): AIProviderKind {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "anthropic") {
    return "anthropic";
  }

  if (baseUrl.includes("anthropic")) return "anthropic";
  return "openai";
}

function getAIProviderDisplayName(providerType: AIProviderKind) {
  return providerType === "anthropic" ? "Anthropic" : "OpenAI";
}

function buildAIProviderProfileName(input: {
  name?: string | null;
  providerType: AIProviderKind;
  model: string;
  baseUrl: string;
}) {
  const explicitName = input.name?.trim();
  if (explicitName) return explicitName;

  if (input.model.trim()) {
    return `${getAIProviderDisplayName(input.providerType)} · ${input.model.trim()}`;
  }

  if (input.baseUrl.trim()) {
    return `${getAIProviderDisplayName(input.providerType)} · ${input.baseUrl.trim()}`;
  }

  return `${getAIProviderDisplayName(input.providerType)} 配置`;
}

function buildAIImageProviderProfileName(input: {
  name?: string | null;
  model: string;
  baseUrl: string;
}) {
  const explicitName = input.name?.trim();
  if (explicitName) return explicitName;

  if (input.model.trim()) {
    return `图片模型 · ${input.model.trim()}`;
  }

  if (input.baseUrl.trim()) {
    return `图片模型 · ${input.baseUrl.trim()}`;
  }

  return "图片模型配置";
}

function maskSecretValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) {
    return "*".repeat(trimmed.length);
  }

  return `${trimmed.slice(0, 4)}${"*".repeat(trimmed.length - 8)}${trimmed.slice(-4)}`;
}

function normalizeAIProviderSecretValue(input: {
  id?: string | null;
  name?: string | null;
  providerType?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
  fastModel?: string | null;
  longformModel?: string | null;
}) {
  const baseUrl = normalizeAIProviderBaseUrl(input.baseUrl ?? "");
  const apiKey = input.apiKey?.trim() ?? "";
  const model = input.model?.trim() ?? "";
  const fastModel = input.fastModel?.trim() ?? "";
  const longformModel = input.longformModel?.trim() ?? "";

  if (!baseUrl && !apiKey && !model && !fastModel && !longformModel) {
    return null;
  }

  const providerType = normalizeAIProviderKind(input.providerType, baseUrl);

  return {
    id: input.id?.trim() || crypto.randomUUID(),
    name: buildAIProviderProfileName({
      name: input.name,
      providerType,
      model,
      baseUrl,
    }),
    providerType,
    baseUrl,
    apiKey,
    model,
    fastModel,
    longformModel,
  } satisfies AIProviderSecret;
}

function readEnvironmentAIProviderSecret() {
  return normalizeAIProviderSecretValue({
    id: ENV_AI_PROVIDER_PROFILE_ID,
    name: "环境变量默认配置",
    providerType: getEnv("AI_PROVIDER_KIND"),
    baseUrl: getEnv("AI_BASE_URL") || getEnv("OPENAI_BASE_URL"),
    apiKey: getEnv("AI_API_KEY") || getEnv("OPENAI_API_KEY"),
    model: getEnv("AI_MODEL") || getEnv("OPENAI_MODEL"),
    fastModel: getEnv("AI_MODEL_FAST") || getEnv("OPENAI_MODEL_FAST"),
    longformModel: getEnv("AI_MODEL_LONGFORM") || getEnv("OPENAI_MODEL_LONGFORM"),
  });
}

function getActiveAIProviderSecret(collection: AIProviderCollectionSecret | null) {
  if (!collection) return null;

  return (
    collection.profiles.find((item) => item.id === collection.activeProfileId) ??
    collection.profiles[0] ??
    null
  );
}

function toAIProviderProfileSummary(profile: AIProviderSecret, activeProfileId: string | null): AIProviderProfileSummary {
  return {
    id: profile.id,
    name: profile.name,
    providerType: profile.providerType,
    baseUrl: profile.baseUrl,
    model: profile.model,
    fastModel: profile.fastModel,
    longformModel: profile.longformModel,
    hasApiKey: Boolean(profile.apiKey),
    maskedApiKey: maskSecretValue(profile.apiKey),
    isActive: profile.id === activeProfileId,
  };
}

function createAIProviderSummaryFromCollection(
  collection: AIProviderCollectionSecret | null,
  source: AIProviderSummary["source"],
) {
  if (!collection) {
    return {
      activeProfileId: null,
      activeProfile: null,
      profiles: [],
      source,
    } satisfies AIProviderSummary;
  }

  const activeProfile =
    collection.profiles.find((item) => item.id === collection.activeProfileId) ??
    collection.profiles[0] ??
    null;

  const profiles = collection.profiles.map((item) => toAIProviderProfileSummary(item, activeProfile?.id ?? null));

  return {
    activeProfileId: activeProfile?.id ?? null,
    activeProfile: activeProfile ? toAIProviderProfileSummary(activeProfile, activeProfile.id) : null,
    profiles,
    source,
  } satisfies AIProviderSummary;
}

function normalizeAIImageProviderSecretValue(input: {
  id?: string | null;
  name?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
}) {
  const baseUrl = normalizeAIProviderBaseUrl(input.baseUrl ?? "");
  const apiKey = input.apiKey?.trim() ?? "";
  const model = input.model?.trim() ?? "";

  if (!baseUrl && !apiKey && !model) {
    return null;
  }

  return {
    id: input.id?.trim() || crypto.randomUUID(),
    name: buildAIImageProviderProfileName({
      name: input.name,
      model,
      baseUrl,
    }),
    baseUrl,
    apiKey,
    model,
  } satisfies AIImageProviderSecret;
}

function readEnvironmentAIImageProviderSecret() {
  return normalizeAIImageProviderSecretValue({
    id: ENV_AI_IMAGE_PROVIDER_PROFILE_ID,
    name: "环境变量默认图片配置",
    baseUrl: getEnv("AI_IMAGE_BASE_URL") || getEnv("OPENAI_IMAGE_BASE_URL") || getEnv("AI_BASE_URL") || getEnv("OPENAI_BASE_URL"),
    apiKey: getEnv("AI_IMAGE_API_KEY") || getEnv("OPENAI_IMAGE_API_KEY") || getEnv("AI_API_KEY") || getEnv("OPENAI_API_KEY"),
    model: getEnv("AI_IMAGE_MODEL") || getEnv("OPENAI_IMAGE_MODEL"),
  });
}

function getActiveAIImageProviderSecret(collection: AIImageProviderCollectionSecret | null) {
  if (!collection) return null;

  return (
    collection.profiles.find((item) => item.id === collection.activeProfileId) ??
    collection.profiles[0] ??
    null
  );
}

function toAIImageProviderProfileSummary(
  profile: AIImageProviderSecret,
  activeProfileId: string | null,
): AIImageProviderProfileSummary {
  return {
    id: profile.id,
    name: profile.name,
    baseUrl: profile.baseUrl,
    model: profile.model,
    hasApiKey: Boolean(profile.apiKey),
    maskedApiKey: maskSecretValue(profile.apiKey),
    isActive: profile.id === activeProfileId,
  };
}

function createAIImageProviderSummaryFromCollection(
  collection: AIImageProviderCollectionSecret | null,
  source: AIImageProviderSummary["source"],
) {
  if (!collection) {
    return {
      activeProfileId: null,
      activeProfile: null,
      profiles: [],
      source,
    } satisfies AIImageProviderSummary;
  }

  const activeProfile =
    collection.profiles.find((item) => item.id === collection.activeProfileId) ??
    collection.profiles[0] ??
    null;

  const profiles = collection.profiles.map((item) => toAIImageProviderProfileSummary(item, activeProfile?.id ?? null));

  return {
    activeProfileId: activeProfile?.id ?? null,
    activeProfile: activeProfile ? toAIImageProviderProfileSummary(activeProfile, activeProfile.id) : null,
    profiles,
    source,
  } satisfies AIImageProviderSummary;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function createMaskedAppId(appId: string) {
  if (appId.length <= 6) return appId;
  return `${appId.slice(0, 3)}***${appId.slice(-3)}`;
}

function toWechatAccountSummary(account: WechatOfficialAccountSecret): WechatOfficialAccountSummary {
  return {
    id: account.id,
    name: account.name,
    appId: account.appId,
    appIdMasked: createMaskedAppId(account.appId),
    hasAppSecret: Boolean(account.appSecret),
    source: account.authorizerRefreshToken ? "third-party" : "legacy",
    defaultAuthor: account.defaultAuthor,
    contentSourceUrl: account.contentSourceUrl,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function mapWechatAuthorizedRecordToSecret(record: {
  id: string;
  authorizerAppId: string;
  nickName: string;
  encryptedAuthorizerAccessToken: string;
  encryptedAuthorizerRefreshToken: string;
  tokenExpiresAt: Date | null;
  defaultAuthor: string;
  contentSourceUrl: string;
  createdAt: Date;
  updatedAt: Date;
}): WechatOfficialAccountSecret {
  return {
    id: record.id,
    name: record.nickName || record.authorizerAppId,
    appId: record.authorizerAppId,
    appSecret: "",
    authorizerAccessToken: record.encryptedAuthorizerAccessToken
      ? decryptSecret(record.encryptedAuthorizerAccessToken)
      : "",
    authorizerRefreshToken: decryptSecret(record.encryptedAuthorizerRefreshToken),
    tokenExpiresAt: record.tokenExpiresAt?.toISOString() ?? null,
    defaultAuthor: record.defaultAuthor,
    contentSourceUrl: record.contentSourceUrl,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function readWechatAuthorizedAccounts(userId: string) {
  if (!hasDatabaseUrl()) return [];

  const records = await prisma.wechatAuthorizedAccount.findMany({
    where: { userId },
    orderBy: [{ isSelected: "desc" }, { updatedAt: "desc" }],
  });

  return records.map(mapWechatAuthorizedRecordToSecret);
}

async function readRawAppConfigRecord(userId: string) {
  if (shouldUseSupabaseAdmin()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_config")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    return data ? {
      id: data.id,
      userId: data.user_id ?? userId,
      settings: data.settings,
      selectedTopicId: data.selected_topic_id,
      updatedAt: data.updated_at,
    } satisfies AppConfigRecord : null;
  }

  const record = await prisma.appConfig.findUnique({
    where: { userId },
  });

  return record ? {
    id: record.id,
    userId: record.userId,
    settings: record.settings,
    selectedTopicId: record.selectedTopicId,
    updatedAt: record.updatedAt,
  } satisfies AppConfigRecord : null;
}

async function saveRawAppConfigRecord(input: {
  userId: string;
  settings: unknown;
  selectedTopicId: string | null;
  updatedAt?: string;
}) {
  const updatedAt = input.updatedAt ?? new Date().toISOString();

  if (shouldUseSupabaseAdmin()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_config")
      .upsert({
        id: input.userId,
        user_id: input.userId,
        settings: input.settings,
        selected_topic_id: input.selectedTopicId,
        updated_at: updatedAt,
      }, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) throw error;
    return {
      id: data.id,
      userId: data.user_id ?? input.userId,
      settings: data.settings,
      selectedTopicId: data.selected_topic_id,
      updatedAt: data.updated_at,
    } satisfies AppConfigRecord;
  }

  const saved = await prisma.appConfig.upsert({
    where: { userId: input.userId },
    create: {
      id: input.userId,
      userId: input.userId,
      settings: input.settings as Prisma.InputJsonValue,
      selectedTopicId: input.selectedTopicId,
    },
    update: {
      settings: input.settings as Prisma.InputJsonValue,
      selectedTopicId: input.selectedTopicId,
    },
  });

  return {
    id: saved.id,
    userId: saved.userId,
    settings: saved.settings,
    selectedTopicId: saved.selectedTopicId,
    updatedAt: saved.updatedAt,
  } satisfies AppConfigRecord;
}

export function normalizeAppSettings(settings: unknown): AppSettings {
  const value = isPlainObject(settings) ? settings as Partial<AppSettings> : {};
  const defaultTemplate =
    typeof value.defaultTemplate === "string" && value.defaultTemplate !== "科技蓝"
      ? value.defaultTemplate
      : defaultSettings.defaultTemplate;

  return {
    accountName: typeof value.accountName === "string" ? value.accountName : defaultSettings.accountName,
    accountPosition: typeof value.accountPosition === "string" ? value.accountPosition : defaultSettings.accountPosition,
    contentAreas: normalizeStringArray(value.contentAreas, defaultSettings.contentAreas).map((item) => resolveArticleDomain(item)),
    bannedTopics: normalizeStringArray(value.bannedTopics, defaultSettings.bannedTopics),
    ctaFollow: typeof value.ctaFollow === "string" ? value.ctaFollow : defaultSettings.ctaFollow,
    ctaEngage: typeof value.ctaEngage === "string" ? value.ctaEngage : defaultSettings.ctaEngage,
    ctaShare: typeof value.ctaShare === "string" ? value.ctaShare : defaultSettings.ctaShare,
    defaultTemplate,
    contentPreferences: normalizeStringArray(value.contentPreferences, defaultSettings.contentPreferences),
  };
}

export function mapAppConfigRecord(record: AppConfigRecord) {
  const updatedAt = record.updatedAt instanceof Date ? record.updatedAt : new Date(record.updatedAt);

  return {
    settings: normalizeAppSettings(record.settings),
    selectedTopicId: record.selectedTopicId,
    updatedAt: updatedAt.toISOString(),
  };
}

export async function readAppConfig(userId: string) {
  const record = await readRawAppConfigRecord(userId);
  return record ? mapAppConfigRecord(record) : null;
}

export async function upsertAppConfig(userId: string, input: { settings?: AppSettings; selectedTopicId?: string | null }) {
  const currentRecord = await readRawAppConfigRecord(userId);
  const current = currentRecord ? mapAppConfigRecord(currentRecord) : null;
  const settings = normalizeAppSettings(input.settings ?? current?.settings ?? defaultSettings);
  const selectedTopicId = input.selectedTopicId === undefined ? current?.selectedTopicId ?? null : input.selectedTopicId;
  const updatedAt = new Date().toISOString();

  const saved = await saveRawAppConfigRecord({
    userId,
    settings,
    selectedTopicId,
    updatedAt,
  });

  return mapAppConfigRecord(saved);
}

export async function readWechatIntegration(userId: string) {
  const accounts = await readWechatAuthorizedAccounts(userId);
  if (accounts.length > 0) {
    return {
      accounts: accounts.map(toWechatAccountSummary),
      selectedAccountId: accounts[0]?.id ?? null,
    };
  }

  return {
    accounts: [],
    selectedAccountId: null,
  };
}

export async function readWechatAccountSecret(userId: string, accountId?: string | null) {
  const authorizedAccounts = await readWechatAuthorizedAccounts(userId);
  if (authorizedAccounts.length > 0) {
    const selectedAccount =
      (accountId ? authorizedAccounts.find((item) => item.id === accountId) : null) ??
      authorizedAccounts[0] ??
      null;

    return {
      account: selectedAccount,
      selectedAccountId: authorizedAccounts[0]?.id ?? null,
      accounts: authorizedAccounts.map(toWechatAccountSummary),
    };
  }

  return {
    account: null,
    selectedAccountId: null,
    accounts: [],
  };
}

export async function upsertWechatAuthorizedAccount(userId: string, input: {
  authorizerAppId: string;
  nickName?: string;
  avatarUrl?: string;
  principalName?: string;
  serviceTypeInfo?: number | null;
  verifyTypeInfo?: number | null;
  authorizerAccessToken: string;
  authorizerRefreshToken: string;
  expiresIn?: number;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("数据库未配置，无法保存微信授权账号。");
  }

  const authorizerAppId = input.authorizerAppId.trim();
  const authorizerRefreshToken = input.authorizerRefreshToken.trim();
  if (!authorizerAppId || !authorizerRefreshToken) {
    throw new Error("微信授权信息不完整。");
  }

  const tokenExpiresAt = input.expiresIn
    ? new Date(Date.now() + Math.max(0, input.expiresIn - 120) * 1000)
    : null;
  const existingCount = await prisma.wechatAuthorizedAccount.count({ where: { userId } });
  const shouldSelect = existingCount === 0;

  if (shouldSelect) {
    await prisma.wechatAuthorizedAccount.updateMany({
      where: { userId },
      data: { isSelected: false },
    });
  }

  await prisma.wechatAuthorizedAccount.upsert({
    where: {
      userId_authorizerAppId: {
        userId,
        authorizerAppId,
      },
    },
    create: {
      userId,
      authorizerAppId,
      nickName: input.nickName?.trim() || authorizerAppId,
      avatarUrl: input.avatarUrl?.trim() ?? "",
      principalName: input.principalName?.trim() ?? "",
      serviceTypeInfo: input.serviceTypeInfo ?? null,
      verifyTypeInfo: input.verifyTypeInfo ?? null,
      encryptedAuthorizerAccessToken: input.authorizerAccessToken.trim()
        ? encryptSecret(input.authorizerAccessToken.trim())
        : "",
      encryptedAuthorizerRefreshToken: encryptSecret(authorizerRefreshToken),
      tokenExpiresAt,
      isSelected: shouldSelect,
    },
    update: {
      nickName: input.nickName?.trim() || authorizerAppId,
      avatarUrl: input.avatarUrl?.trim() ?? "",
      principalName: input.principalName?.trim() ?? "",
      serviceTypeInfo: input.serviceTypeInfo ?? null,
      verifyTypeInfo: input.verifyTypeInfo ?? null,
      encryptedAuthorizerAccessToken: input.authorizerAccessToken.trim()
        ? encryptSecret(input.authorizerAccessToken.trim())
        : "",
      encryptedAuthorizerRefreshToken: encryptSecret(authorizerRefreshToken),
      tokenExpiresAt,
      ...(shouldSelect ? { isSelected: true } : {}),
    },
  });

  return readWechatIntegration(userId);
}

export async function updateWechatAuthorizedAccountToken(userId: string, accountId: string, input: {
  authorizerAccessToken: string;
  authorizerRefreshToken?: string;
  expiresIn?: number;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("数据库未配置，无法刷新微信授权账号。");
  }

  const existing = await prisma.wechatAuthorizedAccount.findFirst({
    where: { id: accountId, userId },
  });

  if (!existing) {
    throw new Error("微信授权账号不存在。");
  }

  await prisma.wechatAuthorizedAccount.update({
    where: { id: existing.id },
    data: {
      encryptedAuthorizerAccessToken: encryptSecret(input.authorizerAccessToken.trim()),
      ...(input.authorizerRefreshToken?.trim()
        ? { encryptedAuthorizerRefreshToken: encryptSecret(input.authorizerRefreshToken.trim()) }
        : {}),
      tokenExpiresAt: input.expiresIn
        ? new Date(Date.now() + Math.max(0, input.expiresIn - 120) * 1000)
        : null,
    },
  });
}

export async function deleteWechatOfficialAccount(userId: string, accountId: string) {
  if (hasDatabaseUrl()) {
    const authorized = await prisma.wechatAuthorizedAccount.findFirst({
      where: { id: accountId, userId },
    });

    if (authorized) {
      await prisma.wechatAuthorizedAccount.delete({
        where: { id: authorized.id },
      });

      if (authorized.isSelected) {
        const fallback = await prisma.wechatAuthorizedAccount.findFirst({
          where: { userId },
          orderBy: [{ updatedAt: "desc" }],
        });
        if (fallback) {
          await prisma.wechatAuthorizedAccount.update({
            where: { id: fallback.id },
            data: { isSelected: true },
          });
        }
      }

      return readWechatIntegration(userId);
    }
  }

  return readWechatIntegration(userId);
}

export async function selectWechatOfficialAccount(userId: string, accountId: string | null) {
  if (hasDatabaseUrl()) {
    const authorizedAccounts = await prisma.wechatAuthorizedAccount.findMany({
      where: { userId },
      orderBy: [{ isSelected: "desc" }, { updatedAt: "desc" }],
    });

    if (authorizedAccounts.length > 0) {
      const selectedAccount =
        (accountId ? authorizedAccounts.find((item) => item.id === accountId) : null) ??
        authorizedAccounts[0];

      await prisma.$transaction([
        prisma.wechatAuthorizedAccount.updateMany({
          where: { userId },
          data: { isSelected: false },
        }),
        prisma.wechatAuthorizedAccount.update({
          where: { id: selectedAccount.id },
          data: { isSelected: true },
        }),
      ]);

      return readWechatIntegration(userId);
    }
  }

  return readWechatIntegration(userId);
}

function getEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function hasAppConfigBackend() {
  return hasDatabaseUrl();
}

function mapUserAIProviderRecord(record: {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string;
  encryptedApiKey: string;
  apiKeyMasked: string;
  model: string;
  fastModel: string;
  longformModel: string;
  isActive: boolean;
}): AIProviderSecret {
  return {
    id: record.id,
    name: record.name,
    providerType: normalizeAIProviderKind(record.providerType, record.baseUrl),
    baseUrl: record.baseUrl,
    apiKey: decryptSecret(record.encryptedApiKey),
    model: record.model,
    fastModel: record.fastModel,
    longformModel: record.longformModel,
  };
}

async function readUserAIProviderCollection(userId: string): Promise<AIProviderCollectionSecret | null> {
  if (!hasDatabaseUrl()) return null;

  const records = await prisma.userAIProvider.findMany({
    where: { userId },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });

  if (!records.length) return null;
  const activeRecord = records.find((item) => item.isActive) ?? records[0];

  return {
    activeProfileId: activeRecord?.id ?? null,
    profiles: records.map(mapUserAIProviderRecord),
  };
}

function readPlatformAIProviderCollection() {
  const envProfile = readEnvironmentAIProviderSecret();
  if (!envProfile) return null;

  return {
    activeProfileId: envProfile.id,
    profiles: [envProfile],
  } satisfies AIProviderCollectionSecret;
}

export async function readAIProviderConfig(userId?: string) {
  const userCollection = userId ? await readUserAIProviderCollection(userId) : null;
  if (userCollection) {
    return createAIProviderSummaryFromCollection(userCollection, "user");
  }

  const platformCollection = readPlatformAIProviderCollection();
  if (platformCollection) {
    return createAIProviderSummaryFromCollection(platformCollection, "platform");
  }

  return createAIProviderSummaryFromCollection(null, "default");
}

export async function readAIProviderSecret(userId?: string): Promise<AIProviderSecretWithSource | null> {
  const userCollection = userId ? await readUserAIProviderCollection(userId) : null;
  const userConfig = getActiveAIProviderSecret(userCollection);
  if (userConfig) return { ...userConfig, source: "user" };
  const platformConfig = readEnvironmentAIProviderSecret();
  return platformConfig ? { ...platformConfig, source: "platform" } : null;
}

export async function upsertAIProviderConfig(userId: string, input: {
  id?: string;
  name?: string;
  providerType?: AIProviderKind;
  baseUrl: string;
  apiKey?: string;
  model: string;
  fastModel?: string;
  longformModel?: string;
  setAsActive?: boolean;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("数据库未配置，无法保存用户模型密钥。");
  }

  const baseUrl = normalizeAIProviderBaseUrl(input.baseUrl);
  const model = input.model.trim();
  const fastModel = input.fastModel?.trim() ?? "";
  const longformModel = input.longformModel?.trim() ?? "";
  const profileId = input.id?.trim() ?? "";
  const existingProfile = profileId
    ? await prisma.userAIProvider.findFirst({ where: { id: profileId, userId } })
    : null;
  const apiKey = input.apiKey?.trim()
    ? input.apiKey.trim()
    : existingProfile
      ? decryptSecret(existingProfile.encryptedApiKey)
      : "";
  const providerType = normalizeAIProviderKind(input.providerType, baseUrl);

  if (!baseUrl) {
    throw new Error("请填写模型接口地址。");
  }

  if (!model) {
    throw new Error("请填写默认写作模型。");
  }

  if (!apiKey) {
    throw new Error("请填写 API Key。");
  }

  const nextId = existingProfile?.id ?? crypto.randomUUID();
  const name = buildAIProviderProfileName({
      name: input.name,
      providerType,
      model,
      baseUrl,
  });
  const shouldActivate = input.setAsActive !== false || !(await prisma.userAIProvider.count({ where: { userId } }));

  if (shouldActivate) {
    await prisma.userAIProvider.updateMany({
      where: { userId },
      data: { isActive: false },
    });
  }

  await prisma.userAIProvider.upsert({
    where: { id: nextId },
    create: {
      id: nextId,
      userId,
      name,
      providerType,
      baseUrl,
      encryptedApiKey: encryptSecret(apiKey),
      apiKeyMasked: maskSecretValue(apiKey),
      model,
      fastModel,
      longformModel,
      isActive: shouldActivate,
    },
    update: {
      name,
      providerType,
      baseUrl,
      encryptedApiKey: encryptSecret(apiKey),
      apiKeyMasked: maskSecretValue(apiKey),
      model,
      fastModel,
      longformModel,
      ...(shouldActivate ? { isActive: true } : {}),
    },
  });

  return readAIProviderConfig(userId);
}

export async function setActiveAIProviderConfig(userId: string, profileId: string) {
  const existing = await prisma.userAIProvider.findFirst({
    where: { id: profileId, userId },
  });

  if (!existing) {
    throw new Error("当前没有可切换的模型配置。");
  }

  await prisma.$transaction([
    prisma.userAIProvider.updateMany({
      where: { userId },
      data: { isActive: false },
    }),
    prisma.userAIProvider.update({
      where: { id: profileId },
      data: { isActive: true },
    }),
  ]);

  return readAIProviderConfig(userId);
}

export async function deleteAIProviderConfig(userId: string, profileId?: string) {
  if (!hasDatabaseUrl()) {
    throw new Error("数据库未配置，无法删除用户模型密钥。");
  }

  if (!profileId) {
    await prisma.userAIProvider.deleteMany({
      where: { userId },
    });
    return readAIProviderConfig(userId);
  }

  const existing = await prisma.userAIProvider.findFirst({
    where: { id: profileId, userId },
  });

  if (!existing) {
    throw new Error("目标模型配置不存在。");
  }

  await prisma.userAIProvider.delete({
    where: { id: existing.id },
  });

  if (existing.isActive) {
    const fallback = await prisma.userAIProvider.findFirst({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }],
    });
    if (fallback) {
      await prisma.userAIProvider.update({
        where: { id: fallback.id },
        data: { isActive: true },
      });
    }
  }

  return readAIProviderConfig(userId);
}

function mapUserAIImageProviderRecord(record: {
  id: string;
  name: string;
  baseUrl: string;
  encryptedApiKey: string;
  model: string;
  isActive: boolean;
}): AIImageProviderSecret {
  return {
    id: record.id,
    name: record.name,
    baseUrl: record.baseUrl,
    apiKey: decryptSecret(record.encryptedApiKey),
    model: record.model,
  };
}

async function readUserAIImageProviderCollection(userId: string): Promise<AIImageProviderCollectionSecret | null> {
  if (!hasDatabaseUrl()) return null;

  const records = await prisma.userAIImageProvider.findMany({
    where: { userId },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });

  if (!records.length) return null;
  const activeRecord = records.find((item) => item.isActive) ?? records[0];

  return {
    activeProfileId: activeRecord?.id ?? null,
    profiles: records.map(mapUserAIImageProviderRecord),
  };
}

function readPlatformAIImageProviderCollection() {
  const envProfile = readEnvironmentAIImageProviderSecret();
  if (!envProfile) return null;

  return {
    activeProfileId: envProfile.id,
    profiles: [envProfile],
  } satisfies AIImageProviderCollectionSecret;
}

export async function readAIImageProviderConfig(userId?: string) {
  const userCollection = userId ? await readUserAIImageProviderCollection(userId) : null;
  if (userCollection) {
    return createAIImageProviderSummaryFromCollection(userCollection, "user");
  }

  const platformCollection = readPlatformAIImageProviderCollection();
  if (platformCollection) {
    return createAIImageProviderSummaryFromCollection(platformCollection, "platform");
  }

  return createAIImageProviderSummaryFromCollection(null, "default");
}

export async function readAIImageProviderSecret(userId?: string): Promise<AIImageProviderSecretWithSource | null> {
  const userCollection = userId ? await readUserAIImageProviderCollection(userId) : null;
  const userConfig = getActiveAIImageProviderSecret(userCollection);
  if (userConfig) return { ...userConfig, source: "user" };
  const platformConfig = readEnvironmentAIImageProviderSecret();
  return platformConfig ? { ...platformConfig, source: "platform" } : null;
}

export async function upsertAIImageProviderConfig(userId: string, input: {
  id?: string;
  name?: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  setAsActive?: boolean;
}) {
  if (!hasDatabaseUrl()) {
    throw new Error("数据库未配置，无法保存用户图片模型密钥。");
  }

  const profileId = input.id?.trim() ?? "";
  const existingProfile = profileId
    ? await prisma.userAIImageProvider.findFirst({ where: { id: profileId, userId } })
    : null;
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  const model = input.model.trim();
  const apiKey = input.apiKey?.trim()
    ? input.apiKey.trim()
    : existingProfile
      ? decryptSecret(existingProfile.encryptedApiKey)
      : "";

  if (!baseUrl) {
    throw new Error("请填写图片模型接口地址。");
  }

  if (!model) {
    throw new Error("请填写图片模型。");
  }

  if (!apiKey) {
    throw new Error("请填写图片模型 API Key。");
  }

  const nextId = existingProfile?.id ?? crypto.randomUUID();
  const name = buildAIImageProviderProfileName({
      name: input.name,
      model,
      baseUrl,
  });
  const shouldActivate = input.setAsActive !== false || !(await prisma.userAIImageProvider.count({ where: { userId } }));

  if (shouldActivate) {
    await prisma.userAIImageProvider.updateMany({
      where: { userId },
      data: { isActive: false },
    });
  }

  await prisma.userAIImageProvider.upsert({
    where: { id: nextId },
    create: {
      id: nextId,
      userId,
      name,
      baseUrl,
      encryptedApiKey: encryptSecret(apiKey),
      apiKeyMasked: maskSecretValue(apiKey),
      model,
      isActive: shouldActivate,
    },
    update: {
      name,
      baseUrl,
      encryptedApiKey: encryptSecret(apiKey),
      apiKeyMasked: maskSecretValue(apiKey),
      model,
      ...(shouldActivate ? { isActive: true } : {}),
    },
  });

  return readAIImageProviderConfig(userId);
}

export async function setActiveAIImageProviderConfig(userId: string, profileId: string) {
  const existing = await prisma.userAIImageProvider.findFirst({
    where: { id: profileId, userId },
  });

  if (!existing) {
    throw new Error("当前没有可切换的图片模型配置。");
  }

  await prisma.$transaction([
    prisma.userAIImageProvider.updateMany({
      where: { userId },
      data: { isActive: false },
    }),
    prisma.userAIImageProvider.update({
      where: { id: profileId },
      data: { isActive: true },
    }),
  ]);

  return readAIImageProviderConfig(userId);
}

export async function deleteAIImageProviderConfig(userId: string, profileId?: string) {
  if (!hasDatabaseUrl()) {
    throw new Error("数据库未配置，无法删除用户图片模型密钥。");
  }

  if (!profileId) {
    await prisma.userAIImageProvider.deleteMany({
      where: { userId },
    });
    return readAIImageProviderConfig(userId);
  }

  const existing = await prisma.userAIImageProvider.findFirst({
    where: { id: profileId, userId },
  });
  if (!existing) {
    throw new Error("目标图片模型配置不存在。");
  }

  await prisma.userAIImageProvider.delete({
    where: { id: existing.id },
  });

  if (existing.isActive) {
    const fallback = await prisma.userAIImageProvider.findFirst({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }],
    });
    if (fallback) {
      await prisma.userAIImageProvider.update({
        where: { id: fallback.id },
        data: { isActive: true },
      });
    }
  }

  return readAIImageProviderConfig(userId);
}
