import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { hasDatabaseUrl } from "./prisma";
import { getSupabaseAdmin } from "./supabase-admin";
import { defaultSettings, type AppSettings } from "./app-data";
import { resolveArticleDomain } from "./content-domains";

const APP_CONFIG_ID = "single-user";
const WECHAT_INTEGRATION_KEY = "__wechatIntegration";

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

function normalizeStringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
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

function mergePublicSettingsWithWechatIntegration(publicSettings: AppSettings, integration: WechatIntegration) {
  return {
    ...publicSettings,
    [WECHAT_INTEGRATION_KEY]: {
      accounts: integration.accounts,
      selectedAccountId: integration.selectedAccountId,
    },
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
  const settings = normalizeAppSettings(input.settings ?? current?.settings ?? defaultSettings);
  const selectedTopicId = input.selectedTopicId === undefined ? current?.selectedTopicId ?? null : input.selectedTopicId;
  const updatedAt = new Date().toISOString();
  const storedSettings = mergePublicSettingsWithWechatIntegration(settings, existingWechatIntegration);

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

  const storedSettings = mergePublicSettingsWithWechatIntegration(currentPublicSettings, {
    accounts,
    selectedAccountId,
  });
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
  const accounts = integration.accounts.filter((item) => item.id !== accountId);
  const selectedAccountId =
    integration.selectedAccountId === accountId
      ? accounts[0]?.id ?? null
      : integration.selectedAccountId;
  const storedSettings = mergePublicSettingsWithWechatIntegration(currentPublicSettings, {
    accounts,
    selectedAccountId,
  });
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
  const selectedAccountId =
    accountId && integration.accounts.some((item) => item.id === accountId)
      ? accountId
      : integration.accounts[0]?.id ?? null;
  const storedSettings = mergePublicSettingsWithWechatIntegration(currentPublicSettings, {
    accounts: integration.accounts,
    selectedAccountId,
  });
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
