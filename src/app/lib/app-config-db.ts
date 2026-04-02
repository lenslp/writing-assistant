import { prisma } from "./prisma";
import { defaultSettings, type AppSettings } from "./app-data";
import { resolveArticleDomain } from "./content-domains";

const APP_CONFIG_ID = "single-user";

type AppConfigRecord = {
  id: string;
  settings: unknown;
  selectedTopicId: string | null;
  updatedAt: Date;
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

export function normalizeAppSettings(settings: unknown): AppSettings {
  const value = settings && typeof settings === "object" && !Array.isArray(settings) ? settings as Partial<AppSettings> : {};

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
  return {
    settings: normalizeAppSettings(record.settings),
    selectedTopicId: record.selectedTopicId,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function readAppConfig() {
  const record = await prisma.appConfig.findUnique({
    where: { id: APP_CONFIG_ID },
  });

  return record ? mapAppConfigRecord(record) : null;
}

export async function upsertAppConfig(input: { settings?: AppSettings; selectedTopicId?: string | null }) {
  const current = await readAppConfig();
  const settings = normalizeAppSettings(input.settings ?? current?.settings ?? defaultSettings);
  const selectedTopicId = input.selectedTopicId === undefined ? current?.selectedTopicId ?? null : input.selectedTopicId;

  const saved = await prisma.appConfig.upsert({
    where: { id: APP_CONFIG_ID },
    create: {
      id: APP_CONFIG_ID,
      settings,
      selectedTopicId,
    },
    update: {
      settings,
      selectedTopicId,
    },
  });

  return mapAppConfigRecord(saved);
}
