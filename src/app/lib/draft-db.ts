import { prisma } from "./prisma";
import { hasDatabaseUrl } from "./prisma";
import { getSupabaseAdmin } from "./supabase-admin";
import {
  calculateWords,
  createFormattingForDomain,
  createDefaultFormatting,
  defaultSettings,
  type Draft,
  type DraftFormatting,
  type DraftStatus,
} from "./app-data";
import { decodeEscapedStructuralText } from "./body-structure";
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
  publishedAt?: Date | string | null;
  publishedChannel?: string | null;
  lastExportedAt?: Date | string | null;
  lastExportFormat?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
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
  const normalizedBody = decodeEscapedStructuralText(draft.body ?? "");
  const words = normalizedBody ? calculateWords(normalizedBody) : draft.words;
  const domain = resolveArticleDomain(draft.domain);

  return {
    ...draft,
    domain,
    body: normalizedBody,
    status: normalizeStatus(draft.status),
    words,
    formatting: normalizeFormatting(draft.formatting ?? createFormattingForDomain(domain, defaultSettings.defaultTemplate)),
  };
}

export function mapDraftRecord(record: DraftRecord): Draft {
  const updatedAt = record.updatedAt instanceof Date ? record.updatedAt : new Date(record.updatedAt);
  const publishedAt = record.publishedAt instanceof Date || record.publishedAt == null
    ? record.publishedAt
    : new Date(record.publishedAt);
  const lastExportedAt = record.lastExportedAt instanceof Date || record.lastExportedAt == null
    ? record.lastExportedAt
    : new Date(record.lastExportedAt);

  return {
    id: record.id,
    domain: resolveArticleDomain(record.domain),
    title: record.title,
    titleCandidates: record.titleCandidates,
    selectedAngle: record.selectedAngle,
    status: normalizeStatus(record.status),
    updatedAt: updatedAt.toISOString(),
    topic: record.topic,
    topicId: record.topicId,
    tags: record.tags,
    words: record.body ? calculateWords(decodeEscapedStructuralText(record.body)) : record.words,
    summary: record.summary,
    outline: record.outline,
    body: decodeEscapedStructuralText(record.body),
    source: record.source,
    formatting: normalizeFormatting(record.formatting),
    publishedAt: publishedAt?.toISOString(),
    publishedChannel: normalizePublishedChannel(record.publishedChannel),
    lastExportedAt: lastExportedAt?.toISOString(),
    lastExportFormat: normalizeExportFormat(record.lastExportFormat),
  };
}

export async function readDrafts() {
  if (!hasDatabaseUrl()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("drafts")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map((item) => mapDraftRecord({
      id: item.id,
      domain: item.domain,
      title: item.title,
      titleCandidates: item.title_candidates ?? [],
      selectedAngle: item.selected_angle,
      status: item.status,
      topic: item.topic,
      topicId: item.topic_id,
      tags: item.tags ?? [],
      words: item.words,
      summary: item.summary,
      outline: item.outline ?? [],
      body: item.body,
      source: item.source,
      formatting: item.formatting,
      publishedAt: item.published_at,
      publishedChannel: item.published_channel,
      lastExportedAt: item.last_exported_at,
      lastExportFormat: item.last_export_format,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));
  }

  const drafts = await prisma.draft.findMany({
    orderBy: [{ updatedAt: "desc" }],
  });

  return drafts.map(mapDraftRecord);
}

export async function readDraftById(draftId: string) {
  if (!hasDatabaseUrl()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("drafts")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return mapDraftRecord({
      id: data.id,
      domain: data.domain,
      title: data.title,
      titleCandidates: data.title_candidates ?? [],
      selectedAngle: data.selected_angle,
      status: data.status,
      topic: data.topic,
      topicId: data.topic_id,
      tags: data.tags ?? [],
      words: data.words,
      summary: data.summary,
      outline: data.outline ?? [],
      body: data.body,
      source: data.source,
      formatting: data.formatting,
      publishedAt: data.published_at,
      publishedChannel: data.published_channel,
      lastExportedAt: data.last_exported_at,
      lastExportFormat: data.last_export_format,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  }

  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
  });

  return draft ? mapDraftRecord(draft) : null;
}

export async function upsertDraft(draft: Draft) {
  const normalized = normalizeDraftInput(draft);

  if (!hasDatabaseUrl()) {
    const supabase = getSupabaseAdmin();
    const payload = {
      id: normalized.id,
      domain: normalized.domain,
      title: normalized.title,
      title_candidates: normalized.titleCandidates,
      selected_angle: normalized.selectedAngle,
      status: normalized.status,
      topic: normalized.topic,
      topic_id: normalized.topicId,
      tags: normalized.tags,
      words: normalized.words,
      summary: normalized.summary,
      outline: normalized.outline,
      body: normalized.body,
      source: normalized.source,
      formatting: normalized.formatting,
      published_at: normalized.publishedAt ?? null,
      published_channel: normalized.publishedChannel ?? null,
      last_exported_at: normalized.lastExportedAt ?? null,
      last_export_format: normalized.lastExportFormat ?? null,
      updated_at: normalized.updatedAt,
    };
    const { data, error } = await supabase
      .from("drafts")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();

    if (error) throw error;
    return mapDraftRecord({
      id: data.id,
      domain: data.domain,
      title: data.title,
      titleCandidates: data.title_candidates ?? [],
      selectedAngle: data.selected_angle,
      status: data.status,
      topic: data.topic,
      topicId: data.topic_id,
      tags: data.tags ?? [],
      words: data.words,
      summary: data.summary,
      outline: data.outline ?? [],
      body: data.body,
      source: data.source,
      formatting: data.formatting,
      publishedAt: data.published_at,
      publishedChannel: data.published_channel,
      lastExportedAt: data.last_exported_at,
      lastExportFormat: data.last_export_format,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  }

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
  const existing = await readDraftById(draftId);
  if (!existing) return null;

  const merged = normalizeDraftInput({
    ...existing,
    ...patch,
    id: draftId,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
    words: patch.body ? calculateWords(patch.body) : patch.words ?? existing.words,
  });

  if (!hasDatabaseUrl()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("drafts")
      .update({
        title: merged.title,
        domain: merged.domain,
        title_candidates: merged.titleCandidates,
        selected_angle: merged.selectedAngle,
        status: merged.status,
        topic: merged.topic,
        topic_id: merged.topicId,
        tags: merged.tags,
        words: merged.words,
        summary: merged.summary,
        outline: merged.outline,
        body: merged.body,
        source: merged.source,
        formatting: merged.formatting,
        published_at: merged.publishedAt ?? null,
        published_channel: merged.publishedChannel ?? null,
        last_exported_at: merged.lastExportedAt ?? null,
        last_export_format: merged.lastExportFormat ?? null,
        updated_at: merged.updatedAt,
      })
      .eq("id", draftId)
      .select("*")
      .single();

    if (error) throw error;
    return mapDraftRecord({
      id: data.id,
      domain: data.domain,
      title: data.title,
      titleCandidates: data.title_candidates ?? [],
      selectedAngle: data.selected_angle,
      status: data.status,
      topic: data.topic,
      topicId: data.topic_id,
      tags: data.tags ?? [],
      words: data.words,
      summary: data.summary,
      outline: data.outline ?? [],
      body: data.body,
      source: data.source,
      formatting: data.formatting,
      publishedAt: data.published_at,
      publishedChannel: data.published_channel,
      lastExportedAt: data.last_exported_at,
      lastExportFormat: data.last_export_format,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  }

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
  if (!hasDatabaseUrl()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("drafts")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .select("*")
      .single();

    if (error) throw error;
    return mapDraftRecord({
      id: data.id,
      domain: data.domain,
      title: data.title,
      titleCandidates: data.title_candidates ?? [],
      selectedAngle: data.selected_angle,
      status: data.status,
      topic: data.topic,
      topicId: data.topic_id,
      tags: data.tags ?? [],
      words: data.words,
      summary: data.summary,
      outline: data.outline ?? [],
      body: data.body,
      source: data.source,
      formatting: data.formatting,
      publishedAt: data.published_at,
      publishedChannel: data.published_channel,
      lastExportedAt: data.last_exported_at,
      lastExportFormat: data.last_export_format,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  }

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
  if (!hasDatabaseUrl()) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("drafts")
      .delete()
      .eq("id", draftId);

    if (error) throw error;
    return;
  }

  await prisma.draft.delete({
    where: { id: draftId },
  });
}
