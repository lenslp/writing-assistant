import { promises as fs } from "node:fs";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { hasDatabaseUrl } from "./prisma";
import { getSupabaseAdmin, hasSupabaseAdminConfig } from "./supabase-admin";
import { defaultSettings, type AppSettings } from "./app-data";
import { resolveArticleDomain } from "./content-domains";

const APP_CONFIG_ID = "single-user";
const WECHAT_INTEGRATION_KEY = "__wechatIntegration";
const AI_IMAGE_PROVIDER_CONFIG_KEY = "__aiImageProviderConfig";
const LOCAL_ENV_FILE = path.join(process.cwd(), ".env.local");
const AI_PROVIDER_LOCAL_ENV_KEYS = [
  "AI_PROVIDER_KIND",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_MODEL",
  "AI_MODEL_FAST",
  "AI_MODEL_LONGFORM",
] as const;
const AI_PROVIDER_COLLECTION_ENV_KEYS = [
  "AI_PROVIDER_PROFILES",
  "AI_PROVIDER_ACTIVE_PROFILE_ID",
] as const;
const AI_IMAGE_PROVIDER_LOCAL_ENV_KEYS = [
  "AI_IMAGE_BASE_URL",
  "AI_IMAGE_API_KEY",
  "AI_IMAGE_MODEL",
] as const;
const AI_IMAGE_PROVIDER_COLLECTION_ENV_KEYS = [
  "AI_IMAGE_PROVIDER_PROFILES",
  "AI_IMAGE_PROVIDER_ACTIVE_PROFILE_ID",
] as const;
const DEFAULT_AI_PROVIDER_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_AI_PROVIDER_MODEL = "qwen3.5-plus";
const LOCAL_AI_PROVIDER_FALLBACK_PROFILE_ID = "local-default";
const ENV_AI_PROVIDER_PROFILE_ID = "environment-default";
const DEFAULT_AI_IMAGE_PROVIDER_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_AI_IMAGE_PROVIDER_MODEL = "gpt-image-1";
const LOCAL_AI_IMAGE_PROVIDER_FALLBACK_PROFILE_ID = "local-image-default";
const ENV_AI_IMAGE_PROVIDER_PROFILE_ID = "environment-image-default";

type AppConfigRecord = {
  id: string;
  settings: unknown;
  selectedTopicId: string | null;
  updatedAt: Date | string;
};

export type WechatOfficialAccountSecret = {
  id: string;
  name: string;
  appId: string;
  appSecret: string;
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
  defaultAuthor: string;
  contentSourceUrl: string;
  createdAt: string;
  updatedAt: string;
};

type WechatIntegration = {
  accounts: WechatOfficialAccountSecret[];
  selectedAccountId: string | null;
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
  source: "local" | "environment" | "default";
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
  source: "local" | "environment" | "default";
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

function parseEnvValue(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
  }

  return trimmed;
}

function parseEnvFile(content: string) {
  const result: Record<string, string> = {};

  content.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) return;

    const [, key, rawValue] = match;
    result[key] = parseEnvValue(rawValue);
  });

  return result;
}

function matchesEnvKey(line: string, key: string) {
  return new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line);
}

function serializeEnvValue(value: string) {
  return JSON.stringify(value);
}

async function readLocalEnvMap() {
  try {
    const content = await fs.readFile(LOCAL_ENV_FILE, "utf8");
    return parseEnvFile(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeLocalEnvValues(updates: Record<string, string | null>) {
  let content = "";

  try {
    content = await fs.readFile(LOCAL_ENV_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  let lines = content ? content.split(/\r?\n/) : [];

  Object.entries(updates).forEach(([key, value]) => {
    lines = lines.filter((line) => !matchesEnvKey(line, key));

    if (value != null && value.trim()) {
      lines.push(`${key}=${serializeEnvValue(value)}`);
    }
  });

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  await fs.writeFile(LOCAL_ENV_FILE, `${lines.join("\n")}\n`, "utf8");
}

function applyLocalEnvValues(updates: Record<string, string | null>) {
  Object.entries(updates).forEach(([key, value]) => {
    if (value == null || !value.trim()) {
      delete process.env[key];
      return;
    }

    process.env[key] = value;
  });
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

function normalizeAIProviderCollectionSecret(value: unknown): AIProviderCollectionSecret | null {
  if (!isPlainObject(value)) return null;

  const rawProfiles = Array.isArray(value.profiles) ? value.profiles : [];
  const profiles = rawProfiles
    .map((item) =>
      normalizeAIProviderSecretValue({
        id: isPlainObject(item) && typeof item.id === "string" ? item.id : null,
        name: isPlainObject(item) && typeof item.name === "string" ? item.name : null,
        providerType: isPlainObject(item) && typeof item.providerType === "string" ? item.providerType : null,
        baseUrl: isPlainObject(item) && typeof item.baseUrl === "string" ? item.baseUrl : null,
        apiKey: isPlainObject(item) && typeof item.apiKey === "string" ? item.apiKey : null,
        model: isPlainObject(item) && typeof item.model === "string" ? item.model : null,
        fastModel: isPlainObject(item) && typeof item.fastModel === "string" ? item.fastModel : null,
        longformModel: isPlainObject(item) && typeof item.longformModel === "string" ? item.longformModel : null,
      }),
    )
    .filter((item): item is AIProviderSecret => Boolean(item));

  if (profiles.length === 0) {
    return null;
  }

  const activeProfileId =
    typeof value.activeProfileId === "string" && profiles.some((item) => item.id === value.activeProfileId)
      ? value.activeProfileId
      : profiles[0]?.id ?? null;

  return {
    activeProfileId,
    profiles,
  };
}

async function readLocalAIProviderCollection() {
  const envMap = await readLocalEnvMap();
  const rawProfiles = envMap.AI_PROVIDER_PROFILES?.trim();

  if (rawProfiles) {
    try {
      const parsed = JSON.parse(rawProfiles) as unknown;
      const collection = normalizeAIProviderCollectionSecret({
        profiles: parsed,
        activeProfileId: envMap.AI_PROVIDER_ACTIVE_PROFILE_ID,
      });

      if (collection) {
        return collection;
      }
    } catch (error) {
      console.error("Failed to parse local AI provider profiles:", error);
    }
  }

  const legacyProfile = normalizeAIProviderSecretValue({
    id: LOCAL_AI_PROVIDER_FALLBACK_PROFILE_ID,
    name: "默认本地配置",
    providerType: envMap.AI_PROVIDER_KIND,
    baseUrl: envMap.AI_BASE_URL,
    apiKey: envMap.AI_API_KEY,
    model: envMap.AI_MODEL,
    fastModel: envMap.AI_MODEL_FAST,
    longformModel: envMap.AI_MODEL_LONGFORM,
  });

  if (!legacyProfile) {
    return null;
  }

  return {
    activeProfileId: legacyProfile.id,
    profiles: [legacyProfile],
  } satisfies AIProviderCollectionSecret;
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

function createAIProviderEnvUpdates(activeProfile: AIProviderSecret | null) {
  return {
    AI_PROVIDER_KIND: activeProfile?.providerType ?? null,
    AI_BASE_URL: activeProfile?.baseUrl ?? null,
    AI_API_KEY: activeProfile?.apiKey ?? null,
    AI_MODEL: activeProfile?.model ?? null,
    AI_MODEL_FAST: activeProfile?.fastModel ?? null,
    AI_MODEL_LONGFORM: activeProfile?.longformModel ?? null,
  } satisfies Record<(typeof AI_PROVIDER_LOCAL_ENV_KEYS)[number], string | null>;
}

async function writeLocalAIProviderCollection(collection: AIProviderCollectionSecret | null) {
  const activeProfile = getActiveAIProviderSecret(collection);
  const updates: Record<string, string | null> = {
    AI_PROVIDER_PROFILES: collection ? JSON.stringify(collection.profiles) : null,
    AI_PROVIDER_ACTIVE_PROFILE_ID: collection?.activeProfileId ?? null,
    ...createAIProviderEnvUpdates(activeProfile),
  };

  await writeLocalEnvValues(updates);
  applyLocalEnvValues(updates);
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

function normalizeAIImageProviderCollectionSecret(value: unknown): AIImageProviderCollectionSecret | null {
  if (!isPlainObject(value)) return null;

  const rawProfiles = Array.isArray(value.profiles) ? value.profiles : [];
  const profiles = rawProfiles
    .map((item) =>
      normalizeAIImageProviderSecretValue({
        id: isPlainObject(item) && typeof item.id === "string" ? item.id : null,
        name: isPlainObject(item) && typeof item.name === "string" ? item.name : null,
        baseUrl: isPlainObject(item) && typeof item.baseUrl === "string" ? item.baseUrl : null,
        apiKey: isPlainObject(item) && typeof item.apiKey === "string" ? item.apiKey : null,
        model: isPlainObject(item) && typeof item.model === "string" ? item.model : null,
      }),
    )
    .filter((item): item is AIImageProviderSecret => Boolean(item));

  if (profiles.length === 0) {
    return null;
  }

  const activeProfileId =
    typeof value.activeProfileId === "string" && profiles.some((item) => item.id === value.activeProfileId)
      ? value.activeProfileId
      : profiles[0]?.id ?? null;

  return {
    activeProfileId,
    profiles,
  };
}

async function readLocalAIImageProviderCollection() {
  const envMap = await readLocalEnvMap();
  const rawProfiles = envMap.AI_IMAGE_PROVIDER_PROFILES?.trim();

  if (rawProfiles) {
    try {
      const parsed = JSON.parse(rawProfiles) as unknown;
      const collection = normalizeAIImageProviderCollectionSecret({
        profiles: parsed,
        activeProfileId: envMap.AI_IMAGE_PROVIDER_ACTIVE_PROFILE_ID,
      });

      if (collection) {
        return collection;
      }
    } catch (error) {
      console.error("Failed to parse local AI image provider profiles:", error);
    }
  }

  const legacyProfile = normalizeAIImageProviderSecretValue({
    id: LOCAL_AI_IMAGE_PROVIDER_FALLBACK_PROFILE_ID,
    name: "默认本地图片配置",
    baseUrl: envMap.AI_IMAGE_BASE_URL,
    apiKey: envMap.AI_IMAGE_API_KEY,
    model: envMap.AI_IMAGE_MODEL,
  });

  if (!legacyProfile) {
    return null;
  }

  return {
    activeProfileId: legacyProfile.id,
    profiles: [legacyProfile],
  } satisfies AIImageProviderCollectionSecret;
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

function createAIImageProviderEnvUpdates(activeProfile: AIImageProviderSecret | null) {
  return {
    AI_IMAGE_BASE_URL: activeProfile?.baseUrl ?? null,
    AI_IMAGE_API_KEY: activeProfile?.apiKey ?? null,
    AI_IMAGE_MODEL: activeProfile?.model ?? null,
  } satisfies Record<(typeof AI_IMAGE_PROVIDER_LOCAL_ENV_KEYS)[number], string | null>;
}

async function writeLocalAIImageProviderCollection(collection: AIImageProviderCollectionSecret | null) {
  const activeProfile = getActiveAIImageProviderSecret(collection);
  const updates: Record<string, string | null> = {
    AI_IMAGE_PROVIDER_PROFILES: collection ? JSON.stringify(collection.profiles) : null,
    AI_IMAGE_PROVIDER_ACTIVE_PROFILE_ID: collection?.activeProfileId ?? null,
    ...createAIImageProviderEnvUpdates(activeProfile),
  };

  await writeLocalEnvValues(updates);
  applyLocalEnvValues(updates);
}

function normalizeReaderJobTraits(value: unknown) {
  if (typeof value !== "string") {
    return defaultSettings.readerJobTraits;
  }

  const normalized = value.trim();
  if (!normalized || normalized === "产品经理") {
    return defaultSettings.readerJobTraits;
  }

  return normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function createMaskedAppId(appId: string) {
  if (appId.length <= 6) return appId;
  return `${appId.slice(0, 3)}***${appId.slice(-3)}`;
}

function normalizeWechatAccount(value: unknown): WechatOfficialAccountSecret | null {
  if (!isPlainObject(value)) return null;

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const appId = typeof value.appId === "string" ? value.appId.trim() : "";
  const appSecret = typeof value.appSecret === "string" ? value.appSecret.trim() : "";
  const defaultAuthor = typeof value.defaultAuthor === "string" ? value.defaultAuthor.trim() : "";
  const contentSourceUrl = typeof value.contentSourceUrl === "string" ? value.contentSourceUrl.trim() : "";
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString();
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString();

  if (!id || !name || !appId) {
    return null;
  }

  return {
    id,
    name,
    appId,
    appSecret,
    defaultAuthor,
    contentSourceUrl,
    createdAt,
    updatedAt,
  };
}

function normalizeWechatIntegration(settings: unknown): WechatIntegration {
  const root = isPlainObject(settings) ? settings : {};
  const rawIntegration = isPlainObject(root[WECHAT_INTEGRATION_KEY]) ? root[WECHAT_INTEGRATION_KEY] : {};
  const rawAccounts = Array.isArray(rawIntegration.accounts) ? rawIntegration.accounts : [];
  const accounts = rawAccounts
    .map(normalizeWechatAccount)
    .filter((item): item is WechatOfficialAccountSecret => Boolean(item));
  const selectedAccountId =
    typeof rawIntegration.selectedAccountId === "string" && accounts.some((item) => item.id === rawIntegration.selectedAccountId)
      ? rawIntegration.selectedAccountId
      : accounts[0]?.id ?? null;

  return {
    accounts,
    selectedAccountId,
  };
}

function normalizeAIImageProviderConfig(settings: unknown): AIImageProviderSecret | null {
  const root = isPlainObject(settings) ? settings : {};
  const rawConfig = isPlainObject(root[AI_IMAGE_PROVIDER_CONFIG_KEY]) ? root[AI_IMAGE_PROVIDER_CONFIG_KEY] : null;

  if (!rawConfig) {
    return null;
  }

  const baseUrl = typeof rawConfig.baseUrl === "string" ? rawConfig.baseUrl.trim().replace(/\/+$/, "") : "";
  const apiKey = typeof rawConfig.apiKey === "string" ? rawConfig.apiKey.trim() : "";
  const model = typeof rawConfig.model === "string" ? rawConfig.model.trim() : "";

  if (!baseUrl && !apiKey && !model) {
    return null;
  }

  return {
    id: typeof rawConfig.id === "string" ? rawConfig.id.trim() || LOCAL_AI_IMAGE_PROVIDER_FALLBACK_PROFILE_ID : LOCAL_AI_IMAGE_PROVIDER_FALLBACK_PROFILE_ID,
    name: typeof rawConfig.name === "string" ? rawConfig.name.trim() || "默认图片模型配置" : "默认图片模型配置",
    baseUrl,
    apiKey,
    model,
  };
}

function toWechatAccountSummary(account: WechatOfficialAccountSecret): WechatOfficialAccountSummary {
  return {
    id: account.id,
    name: account.name,
    appId: account.appId,
    appIdMasked: createMaskedAppId(account.appId),
    hasAppSecret: Boolean(account.appSecret),
    defaultAuthor: account.defaultAuthor,
    contentSourceUrl: account.contentSourceUrl,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function mergePublicSettingsWithSecrets(
  publicSettings: AppSettings,
  integration: WechatIntegration,
  aiProviderConfig: unknown,
  aiImageProviderConfig: AIImageProviderSecret | null,
) {
  return {
    ...publicSettings,
    [WECHAT_INTEGRATION_KEY]: {
      accounts: integration.accounts,
      selectedAccountId: integration.selectedAccountId,
    },
    ...(aiImageProviderConfig
      ? {
          [AI_IMAGE_PROVIDER_CONFIG_KEY]: aiImageProviderConfig,
        }
      : {}),
  };
}

async function readRawAppConfigRecord() {
  if (!hasDatabaseUrl()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_config")
      .select("*")
      .eq("id", APP_CONFIG_ID)
      .maybeSingle();

    if (error) throw error;
    return data ? {
      id: data.id,
      settings: data.settings,
      selectedTopicId: data.selected_topic_id,
      updatedAt: data.updated_at,
    } satisfies AppConfigRecord : null;
  }

  const record = await prisma.appConfig.findUnique({
    where: { id: APP_CONFIG_ID },
  });

  return record ? {
    id: record.id,
    settings: record.settings,
    selectedTopicId: record.selectedTopicId,
    updatedAt: record.updatedAt,
  } satisfies AppConfigRecord : null;
}

async function saveRawAppConfigRecord(input: {
  settings: unknown;
  selectedTopicId: string | null;
  updatedAt?: string;
}) {
  const updatedAt = input.updatedAt ?? new Date().toISOString();

  if (!hasDatabaseUrl()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_config")
      .upsert({
        id: APP_CONFIG_ID,
        settings: input.settings,
        selected_topic_id: input.selectedTopicId,
        updated_at: updatedAt,
      }, { onConflict: "id" })
      .select("*")
      .single();

    if (error) throw error;
    return {
      id: data.id,
      settings: data.settings,
      selectedTopicId: data.selected_topic_id,
      updatedAt: data.updated_at,
    } satisfies AppConfigRecord;
  }

  const saved = await prisma.appConfig.upsert({
    where: { id: APP_CONFIG_ID },
    create: {
      id: APP_CONFIG_ID,
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
    settings: saved.settings,
    selectedTopicId: saved.selectedTopicId,
    updatedAt: saved.updatedAt,
  } satisfies AppConfigRecord;
}

export function normalizeAppSettings(settings: unknown): AppSettings {
  const value = isPlainObject(settings) ? settings as Partial<AppSettings> : {};

  return {
    accountName: typeof value.accountName === "string" ? value.accountName : defaultSettings.accountName,
    accountPosition: typeof value.accountPosition === "string" ? value.accountPosition : defaultSettings.accountPosition,
    contentAreas: normalizeStringArray(value.contentAreas, defaultSettings.contentAreas).map((item) => resolveArticleDomain(item)),
    readerAgeRange: typeof value.readerAgeRange === "string" ? value.readerAgeRange : defaultSettings.readerAgeRange,
    readerJobTraits: normalizeReaderJobTraits(value.readerJobTraits),
    readerNeeds: typeof value.readerNeeds === "string" ? value.readerNeeds : defaultSettings.readerNeeds,
    toneKeywords: normalizeStringArray(value.toneKeywords, defaultSettings.toneKeywords),
    bannedTopics: normalizeStringArray(value.bannedTopics, defaultSettings.bannedTopics),
    ctaFollow: typeof value.ctaFollow === "string" ? value.ctaFollow : defaultSettings.ctaFollow,
    ctaEngage: typeof value.ctaEngage === "string" ? value.ctaEngage : defaultSettings.ctaEngage,
    ctaShare: typeof value.ctaShare === "string" ? value.ctaShare : defaultSettings.ctaShare,
    defaultTemplate: typeof value.defaultTemplate === "string" ? value.defaultTemplate : defaultSettings.defaultTemplate,
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

export async function readAppConfig() {
  const record = await readRawAppConfigRecord();
  return record ? mapAppConfigRecord(record) : null;
}

export async function upsertAppConfig(input: { settings?: AppSettings; selectedTopicId?: string | null }) {
  const currentRecord = await readRawAppConfigRecord();
  const current = currentRecord ? mapAppConfigRecord(currentRecord) : null;
  const existingWechatIntegration = normalizeWechatIntegration(currentRecord?.settings);
  const existingAIImageProviderConfig = normalizeAIImageProviderConfig(currentRecord?.settings);
  const settings = normalizeAppSettings(input.settings ?? current?.settings ?? defaultSettings);
  const selectedTopicId = input.selectedTopicId === undefined ? current?.selectedTopicId ?? null : input.selectedTopicId;
  const updatedAt = new Date().toISOString();
  const storedSettings = mergePublicSettingsWithSecrets(
    settings,
    existingWechatIntegration,
    null,
    existingAIImageProviderConfig,
  );

  const saved = await saveRawAppConfigRecord({
    settings: storedSettings,
    selectedTopicId,
    updatedAt,
  });

  return mapAppConfigRecord(saved);
}

export async function readWechatIntegration() {
  const record = await readRawAppConfigRecord();
  const integration = normalizeWechatIntegration(record?.settings);

  return {
    accounts: integration.accounts.map(toWechatAccountSummary),
    selectedAccountId: integration.selectedAccountId,
  };
}

export async function readWechatAccountSecret(accountId?: string | null) {
  const record = await readRawAppConfigRecord();
  const integration = normalizeWechatIntegration(record?.settings);
  const selectedAccount =
    (accountId ? integration.accounts.find((item) => item.id === accountId) : null) ??
    (integration.selectedAccountId ? integration.accounts.find((item) => item.id === integration.selectedAccountId) : null) ??
    integration.accounts[0] ??
    null;

  return {
    account: selectedAccount,
    selectedAccountId: integration.selectedAccountId,
    accounts: integration.accounts.map(toWechatAccountSummary),
  };
}

export async function upsertWechatOfficialAccount(input: {
  id?: string;
  name: string;
  appId: string;
  appSecret?: string;
  defaultAuthor?: string;
  contentSourceUrl?: string;
  setAsSelected?: boolean;
}) {
  const record = await readRawAppConfigRecord();
  const currentPublicSettings = normalizeAppSettings(record?.settings);
  const integration = normalizeWechatIntegration(record?.settings);
  const aiImageProviderConfig = normalizeAIImageProviderConfig(record?.settings);
  const now = new Date().toISOString();
  const targetId = input.id?.trim() || crypto.randomUUID();
  const existing = integration.accounts.find((item) => item.id === targetId) ?? null;

  if (
    input.appId.trim() &&
    integration.accounts.some((item) => item.id !== targetId && item.appId === input.appId.trim())
  ) {
    throw new Error("这个 AppID 已经存在，请直接编辑原账号。");
  }

  const nextAccount = normalizeWechatAccount({
    id: targetId,
    name: input.name,
    appId: input.appId,
    appSecret: input.appSecret?.trim() ? input.appSecret : existing?.appSecret ?? "",
    defaultAuthor: input.defaultAuthor ?? existing?.defaultAuthor ?? "",
    contentSourceUrl: input.contentSourceUrl ?? existing?.contentSourceUrl ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  if (!nextAccount) {
    throw new Error("公众号账号信息不完整，请至少填写账号名称和 AppID。");
  }

  if (!nextAccount.appSecret) {
    throw new Error("请填写 AppSecret。");
  }

  const accounts = [
    ...integration.accounts.filter((item) => item.id !== targetId),
    nextAccount,
  ].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  const selectedAccountId =
    input.setAsSelected || !integration.selectedAccountId || !accounts.some((item) => item.id === integration.selectedAccountId)
      ? targetId
      : integration.selectedAccountId;

  const storedSettings = mergePublicSettingsWithSecrets(
    currentPublicSettings,
    {
      accounts,
      selectedAccountId,
    },
    null,
    aiImageProviderConfig,
  );
  await saveRawAppConfigRecord({
    settings: storedSettings,
    selectedTopicId: record?.selectedTopicId ?? null,
    updatedAt: now,
  });

  return {
    accounts: accounts.map(toWechatAccountSummary),
    selectedAccountId,
  };
}

export async function deleteWechatOfficialAccount(accountId: string) {
  const record = await readRawAppConfigRecord();
  const currentPublicSettings = normalizeAppSettings(record?.settings);
  const integration = normalizeWechatIntegration(record?.settings);
  const aiImageProviderConfig = normalizeAIImageProviderConfig(record?.settings);
  const accounts = integration.accounts.filter((item) => item.id !== accountId);
  const selectedAccountId =
    integration.selectedAccountId === accountId
      ? accounts[0]?.id ?? null
      : integration.selectedAccountId;
  const storedSettings = mergePublicSettingsWithSecrets(
    currentPublicSettings,
    {
      accounts,
      selectedAccountId,
    },
    null,
    aiImageProviderConfig,
  );
  const now = new Date().toISOString();

  await saveRawAppConfigRecord({
    settings: storedSettings,
    selectedTopicId: record?.selectedTopicId ?? null,
    updatedAt: now,
  });

  return {
    accounts: accounts.map(toWechatAccountSummary),
    selectedAccountId,
  };
}

export async function selectWechatOfficialAccount(accountId: string | null) {
  const record = await readRawAppConfigRecord();
  const currentPublicSettings = normalizeAppSettings(record?.settings);
  const integration = normalizeWechatIntegration(record?.settings);
  const aiImageProviderConfig = normalizeAIImageProviderConfig(record?.settings);
  const selectedAccountId =
    accountId && integration.accounts.some((item) => item.id === accountId)
      ? accountId
      : integration.accounts[0]?.id ?? null;
  const storedSettings = mergePublicSettingsWithSecrets(
    currentPublicSettings,
    {
      accounts: integration.accounts,
      selectedAccountId,
    },
    null,
    aiImageProviderConfig,
  );
  const now = new Date().toISOString();

  await saveRawAppConfigRecord({
    settings: storedSettings,
    selectedTopicId: record?.selectedTopicId ?? null,
    updatedAt: now,
  });

  return {
    accounts: integration.accounts.map(toWechatAccountSummary),
    selectedAccountId,
  };
}

function getEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function hasAppConfigBackend() {
  return hasDatabaseUrl() || hasSupabaseAdminConfig();
}

export async function readAIProviderConfig() {
  const localCollection = await readLocalAIProviderCollection();
  if (localCollection) {
    return createAIProviderSummaryFromCollection(localCollection, "local");
  }

  const envProfile = readEnvironmentAIProviderSecret();
  if (envProfile) {
    return createAIProviderSummaryFromCollection({
      activeProfileId: envProfile.id,
      profiles: [envProfile],
    }, "environment");
  }

  return createAIProviderSummaryFromCollection(null, "default");
}

export async function readAIProviderSecret() {
  const localCollection = await readLocalAIProviderCollection();
  const localConfig = getActiveAIProviderSecret(localCollection);
  if (localConfig) return localConfig;
  return readEnvironmentAIProviderSecret();
}

export async function upsertAIProviderConfig(input: {
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
  const baseUrl = normalizeAIProviderBaseUrl(input.baseUrl);
  const model = input.model.trim();
  const fastModel = input.fastModel?.trim() ?? "";
  const longformModel = input.longformModel?.trim() ?? "";
  const collection = await readLocalAIProviderCollection();
  const existingProfile = input.id?.trim()
    ? collection?.profiles.find((item) => item.id === input.id?.trim()) ?? null
    : null;
  const apiKey = input.apiKey?.trim() ? input.apiKey.trim() : existingProfile?.apiKey ?? "";
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

  const nextProfile: AIProviderSecret = {
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
  };
  const currentProfiles = collection?.profiles ?? [];
  const nextProfiles = currentProfiles.some((item) => item.id === nextProfile.id)
    ? currentProfiles.map((item) => (item.id === nextProfile.id ? nextProfile : item))
    : [nextProfile, ...currentProfiles];
  const nextActiveProfileId = input.setAsActive === false
    ? (collection?.activeProfileId && nextProfiles.some((item) => item.id === collection.activeProfileId)
      ? collection.activeProfileId
      : nextProfiles[0]?.id ?? nextProfile.id)
    : nextProfile.id;
  const nextCollection: AIProviderCollectionSecret = {
    activeProfileId: nextActiveProfileId,
    profiles: nextProfiles,
  };

  await writeLocalAIProviderCollection(nextCollection);
  return readAIProviderConfig();
}

export async function setActiveAIProviderConfig(profileId: string) {
  const collection = await readLocalAIProviderCollection();
  if (!collection || collection.profiles.length === 0) {
    throw new Error("当前没有可切换的模型配置。");
  }

  if (!collection.profiles.some((item) => item.id === profileId)) {
    throw new Error("目标模型配置不存在。");
  }

  await writeLocalAIProviderCollection({
    activeProfileId: profileId,
    profiles: collection.profiles,
  });

  return readAIProviderConfig();
}

export async function deleteAIProviderConfig(profileId?: string) {
  if (!profileId) {
    const updates = Object.fromEntries(
      [...AI_PROVIDER_COLLECTION_ENV_KEYS, ...AI_PROVIDER_LOCAL_ENV_KEYS].map((key) => [key, null]),
    ) as Record<string, null>;
    await writeLocalEnvValues(updates);
    applyLocalEnvValues(updates);
    return readAIProviderConfig();
  }

  const collection = await readLocalAIProviderCollection();
  if (!collection || collection.profiles.length === 0) {
    throw new Error("当前没有可删除的模型配置。");
  }

  const nextProfiles = collection.profiles.filter((item) => item.id !== profileId);
  if (nextProfiles.length === collection.profiles.length) {
    throw new Error("目标模型配置不存在。");
  }

  if (nextProfiles.length === 0) {
    const updates = Object.fromEntries(
      [...AI_PROVIDER_COLLECTION_ENV_KEYS, ...AI_PROVIDER_LOCAL_ENV_KEYS].map((key) => [key, null]),
    ) as Record<string, null>;
    await writeLocalEnvValues(updates);
    applyLocalEnvValues(updates);
    return readAIProviderConfig();
  }

  const nextActiveProfileId =
    collection.activeProfileId === profileId
      ? nextProfiles[0]?.id ?? null
      : collection.activeProfileId;

  await writeLocalAIProviderCollection({
    activeProfileId: nextActiveProfileId,
    profiles: nextProfiles,
  });

  return readAIProviderConfig();
}

export async function readAIImageProviderConfig() {
  const localCollection = await readLocalAIImageProviderCollection();
  if (localCollection) {
    return createAIImageProviderSummaryFromCollection(localCollection, "local");
  }

  const envProfile = readEnvironmentAIImageProviderSecret();
  if (envProfile) {
    return createAIImageProviderSummaryFromCollection({
      activeProfileId: envProfile.id,
      profiles: [envProfile],
    }, "environment");
  }

  const record = hasAppConfigBackend() ? await readRawAppConfigRecord() : null;
  const storedConfig = normalizeAIImageProviderConfig(record?.settings);
  if (storedConfig) {
    const legacyProfile = normalizeAIImageProviderSecretValue({
      id: storedConfig.id,
      name: storedConfig.name,
      baseUrl: storedConfig.baseUrl,
      apiKey: storedConfig.apiKey,
      model: storedConfig.model,
    });
    return createAIImageProviderSummaryFromCollection(
      legacyProfile
        ? {
            activeProfileId: legacyProfile.id,
            profiles: [legacyProfile],
          }
        : null,
      "environment",
    );
  }

  return createAIImageProviderSummaryFromCollection(null, "default");
}

export async function readAIImageProviderSecret() {
  const localCollection = await readLocalAIImageProviderCollection();
  const localConfig = getActiveAIImageProviderSecret(localCollection);
  if (localConfig) return localConfig;

  const envConfig = readEnvironmentAIImageProviderSecret();
  if (envConfig) return envConfig;

  const record = hasAppConfigBackend() ? await readRawAppConfigRecord() : null;
  const storedConfig = normalizeAIImageProviderConfig(record?.settings);
  return normalizeAIImageProviderSecretValue({
    id: storedConfig?.id,
    name: storedConfig?.name,
    baseUrl: storedConfig?.baseUrl,
    apiKey: storedConfig?.apiKey,
    model: storedConfig?.model,
  });
}

export async function upsertAIImageProviderConfig(input: {
  id?: string;
  name?: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  setAsActive?: boolean;
}) {
  const collection = await readLocalAIImageProviderCollection();
  const existingProfile = input.id?.trim()
    ? collection?.profiles.find((item) => item.id === input.id?.trim()) ?? null
    : null;
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  const model = input.model.trim();
  const apiKey = input.apiKey?.trim() ? input.apiKey.trim() : existingProfile?.apiKey ?? "";

  if (!baseUrl) {
    throw new Error("请填写图片模型接口地址。");
  }

  if (!model) {
    throw new Error("请填写图片模型。");
  }

  if (!apiKey) {
    throw new Error("请填写图片模型 API Key。");
  }

  const nextProfile: AIImageProviderSecret = {
    id: input.id?.trim() || crypto.randomUUID(),
    name: buildAIImageProviderProfileName({
      name: input.name,
      model,
      baseUrl,
    }),
    baseUrl,
    apiKey,
    model,
  };
  const currentProfiles = collection?.profiles ?? [];
  const nextProfiles = currentProfiles.some((item) => item.id === nextProfile.id)
    ? currentProfiles.map((item) => (item.id === nextProfile.id ? nextProfile : item))
    : [nextProfile, ...currentProfiles];
  const nextActiveProfileId = input.setAsActive === false
    ? (collection?.activeProfileId && nextProfiles.some((item) => item.id === collection.activeProfileId)
      ? collection.activeProfileId
      : nextProfiles[0]?.id ?? nextProfile.id)
    : nextProfile.id;

  await writeLocalAIImageProviderCollection({
    activeProfileId: nextActiveProfileId,
    profiles: nextProfiles,
  });

  return readAIImageProviderConfig();
}

export async function setActiveAIImageProviderConfig(profileId: string) {
  const collection = await readLocalAIImageProviderCollection();
  if (!collection || collection.profiles.length === 0) {
    throw new Error("当前没有可切换的图片模型配置。");
  }

  if (!collection.profiles.some((item) => item.id === profileId)) {
    throw new Error("目标图片模型配置不存在。");
  }

  await writeLocalAIImageProviderCollection({
    activeProfileId: profileId,
    profiles: collection.profiles,
  });

  return readAIImageProviderConfig();
}

export async function deleteAIImageProviderConfig(profileId?: string) {
  if (!profileId) {
    const updates = Object.fromEntries(
      [...AI_IMAGE_PROVIDER_COLLECTION_ENV_KEYS, ...AI_IMAGE_PROVIDER_LOCAL_ENV_KEYS].map((key) => [key, null]),
    ) as Record<string, null>;
    await writeLocalEnvValues(updates);
    applyLocalEnvValues(updates);
    return readAIImageProviderConfig();
  }

  const collection = await readLocalAIImageProviderCollection();
  if (!collection || collection.profiles.length === 0) {
    throw new Error("当前没有可删除的图片模型配置。");
  }

  const nextProfiles = collection.profiles.filter((item) => item.id !== profileId);
  if (nextProfiles.length === collection.profiles.length) {
    throw new Error("目标图片模型配置不存在。");
  }

  if (nextProfiles.length === 0) {
    const updates = Object.fromEntries(
      [...AI_IMAGE_PROVIDER_COLLECTION_ENV_KEYS, ...AI_IMAGE_PROVIDER_LOCAL_ENV_KEYS].map((key) => [key, null]),
    ) as Record<string, null>;
    await writeLocalEnvValues(updates);
    applyLocalEnvValues(updates);
    return readAIImageProviderConfig();
  }

  const nextActiveProfileId =
    collection.activeProfileId === profileId
      ? nextProfiles[0]?.id ?? null
      : collection.activeProfileId;

  await writeLocalAIImageProviderCollection({
    activeProfileId: nextActiveProfileId,
    profiles: nextProfiles,
  });

  return readAIImageProviderConfig();
}
