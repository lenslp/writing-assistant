import { prisma } from "./prisma";
import {
  calculateWords,
  createFormattingForDomain,
  createDefaultFormatting,
  defaultSettings,
  type Draft,
  type DraftFormatting,
  type DraftStatus,
} from "./app-data";
import { resolveArticleDomain } from "./content-domains";

type DraftRecord = {
  id: string;
  domain?: string | null;
  title: string;
  titleCandidates: string[];
  selectedAngle: string;
  status: string;
  topic: string;
  topicId: string;
  tags: string[];
  words: number;
  summary: string;
  outline: string[];
  body: string;
  source: string;
  formatting: unknown;
  publishedAt?: Date | null;
  publishedChannel?: string | null;
  lastExportedAt?: Date | null;
  lastExportFormat?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const validStatuses = new Set<DraftStatus>(["待生成", "待修改", "审核中", "已发布"]);

function normalizeStatus(status: string): DraftStatus {
  return validStatuses.has(status as DraftStatus) ? (status as DraftStatus) : "待修改";
}

function normalizeFormatting(formatting: unknown): DraftFormatting {
  if (!formatting || typeof formatting !== "object" || Array.isArray(formatting)) {
    return createDefaultFormatting(defaultSettings.defaultTemplate);
  }

  return {
    ...createDefaultFormatting(defaultSettings.defaultTemplate),
    ...(formatting as Partial<DraftFormatting>),
  };
}

function normalizePublishedChannel(channel: unknown): Draft["publishedChannel"] {
  return ["公众号", "知乎", "微博", "头条", "小红书"].includes(String(channel))
    ? (channel as Draft["publishedChannel"])
    : undefined;
}

function normalizeExportFormat(format: unknown): Draft["lastExportFormat"] {
  return ["html", "md", "wechat"].includes(String(format))
    ? (format as Draft["lastExportFormat"])
    : undefined;
}

function normalizeDraftInput(draft: Draft): Draft {
  const words = draft.body ? calculateWords(draft.body) : draft.words;
  const domain = resolveArticleDomain(draft.domain);

  return {
    ...draft,
    domain,
    status: normalizeStatus(draft.status),
    words,
    formatting: normalizeFormatting(draft.formatting ?? createFormattingForDomain(domain, defaultSettings.defaultTemplate)),
  };
}

export function mapDraftRecord(record: DraftRecord): Draft {
  return {
    id: record.id,
    domain: resolveArticleDomain(record.domain),
    title: record.title,
    titleCandidates: record.titleCandidates,
    selectedAngle: record.selectedAngle,
    status: normalizeStatus(record.status),
    updatedAt: record.updatedAt.toISOString(),
    topic: record.topic,
    topicId: record.topicId,
    tags: record.tags,
    words: record.words,
    summary: record.summary,
    outline: record.outline,
    body: record.body,
    source: record.source,
    formatting: normalizeFormatting(record.formatting),
    publishedAt: record.publishedAt?.toISOString(),
    publishedChannel: normalizePublishedChannel(record.publishedChannel),
    lastExportedAt: record.lastExportedAt?.toISOString(),
    lastExportFormat: normalizeExportFormat(record.lastExportFormat),
  };
}

export async function readDrafts() {
  const drafts = await prisma.draft.findMany({
    orderBy: [{ updatedAt: "desc" }],
  });

  return drafts.map(mapDraftRecord);
}

export async function readDraftById(draftId: string) {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
  });

  return draft ? mapDraftRecord(draft) : null;
}

export async function upsertDraft(draft: Draft) {
  const normalized = normalizeDraftInput(draft);

  const saved = await prisma.draft.upsert({
    where: { id: normalized.id },
    create: {
      id: normalized.id,
      domain: normalized.domain,
      title: normalized.title,
      titleCandidates: normalized.titleCandidates,
      selectedAngle: normalized.selectedAngle,
      status: normalized.status,
      topic: normalized.topic,
      topicId: normalized.topicId,
      tags: normalized.tags,
      words: normalized.words,
      summary: normalized.summary,
      outline: normalized.outline,
      body: normalized.body,
      source: normalized.source,
      formatting: normalized.formatting,
      publishedAt: normalized.publishedAt ? new Date(normalized.publishedAt) : null,
      publishedChannel: normalized.publishedChannel ?? null,
      lastExportedAt: normalized.lastExportedAt ? new Date(normalized.lastExportedAt) : null,
      lastExportFormat: normalized.lastExportFormat ?? null,
      updatedAt: new Date(normalized.updatedAt),
    },
    update: {
      title: normalized.title,
      domain: normalized.domain,
      titleCandidates: normalized.titleCandidates,
      selectedAngle: normalized.selectedAngle,
      status: normalized.status,
      topic: normalized.topic,
      topicId: normalized.topicId,
      tags: normalized.tags,
      words: normalized.words,
      summary: normalized.summary,
      outline: normalized.outline,
      body: normalized.body,
      source: normalized.source,
      formatting: normalized.formatting,
      publishedAt: normalized.publishedAt ? new Date(normalized.publishedAt) : null,
      publishedChannel: normalized.publishedChannel ?? null,
      lastExportedAt: normalized.lastExportedAt ? new Date(normalized.lastExportedAt) : null,
      lastExportFormat: normalized.lastExportFormat ?? null,
      updatedAt: new Date(normalized.updatedAt),
    },
  });

  return mapDraftRecord(saved);
}

export async function patchDraft(draftId: string, patch: Partial<Draft>) {
  const existing = await prisma.draft.findUnique({
    where: { id: draftId },
  });

  if (!existing) return null;

  const merged = normalizeDraftInput({
    ...mapDraftRecord(existing),
    ...patch,
    id: draftId,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
    words: patch.body ? calculateWords(patch.body) : patch.words ?? mapDraftRecord(existing).words,
  });

  const saved = await prisma.draft.update({
    where: { id: draftId },
    data: {
      title: merged.title,
      domain: merged.domain,
      titleCandidates: merged.titleCandidates,
      selectedAngle: merged.selectedAngle,
      status: merged.status,
      topic: merged.topic,
      topicId: merged.topicId,
      tags: merged.tags,
      words: merged.words,
      summary: merged.summary,
      outline: merged.outline,
      body: merged.body,
      source: merged.source,
      formatting: merged.formatting,
      publishedAt: merged.publishedAt ? new Date(merged.publishedAt) : null,
      publishedChannel: merged.publishedChannel ?? null,
      lastExportedAt: merged.lastExportedAt ? new Date(merged.lastExportedAt) : null,
      lastExportFormat: merged.lastExportFormat ?? null,
      updatedAt: new Date(merged.updatedAt),
    },
  });

  return mapDraftRecord(saved);
}

export async function updateDraftStatusById(draftId: string, status: DraftStatus) {
  const saved = await prisma.draft.update({
    where: { id: draftId },
    data: {
      status,
      updatedAt: new Date(),
    },
  });

  return mapDraftRecord(saved);
}

export async function deleteDraftById(draftId: string) {
  await prisma.draft.delete({
    where: { id: draftId },
  });
}
