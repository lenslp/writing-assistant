"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  calculateWords,
  createBody,
  createFormattingForDomain,
  createOutline,
  createSummary,
  createTitleCandidates,
  defaultDrafts,
  defaultSettings,
  recommendedTopics,
  type AppSettings,
  type Draft,
  type DraftStatus,
  type TopicSuggestion,
} from "../lib/app-data";
import { decodeEscapedStructuralText } from "../lib/body-structure";
import { detectArticleDomain, resolveArticleDomain } from "../lib/content-domains";
import { buildTopicIdentityKey } from "../lib/topic-utils";

const SETTINGS_KEY = "wechat-writer:settings";
const DRAFTS_KEY = "wechat-writer:drafts";
const TOPIC_KEY = "wechat-writer:selected-topic";
const CUSTOM_TOPICS_KEY = "wechat-writer:custom-topics";

type StoredTopicSuggestion = Pick<
  TopicSuggestion,
  "id" | "title" | "domain" | "heat" | "fit" | "reason" | "angles" | "source" | "type" | "tags"
>;

function getBrowserStorage() {
  if (typeof window === "undefined") return null;
  const storage = window.localStorage;
  return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function" ? storage : null;
}

function isQuotaExceededError(error: unknown) {
  return error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || error.code === 22 || error.code === 1014);
}

function trySetStorageItem(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    if (isQuotaExceededError(error)) {
      console.warn(`Skipped persisting ${key} because browser storage quota was exceeded.`);
      return false;
    }

    console.error(`Failed to persist ${key}:`, error);
    return false;
  }
}

type GenerateScope = "title" | "outline" | "body";

type AppStoreContextValue = {
  settings: AppSettings;
  drafts: Draft[];
  topics: TopicSuggestion[];
  selectedTopic: TopicSuggestion | null;
  saveSettings: (settings: AppSettings) => void;
  selectTopic: (topicId: string | null) => void;
  upsertTopic: (topic: TopicSuggestion) => TopicSuggestion;
  generateDraftFromTopic: (topicId: string, scope?: GenerateScope) => Draft;
  updateDraft: (draftId: string, patch: Partial<Draft>) => void;
  updateDraftStatus: (draftId: string, status: DraftStatus) => void;
  submitDraftReview: (draftId: string, patch?: Partial<Draft>) => void;
  returnDraftToEditing: (draftId: string, patch?: Partial<Draft>) => void;
  publishDraft: (draftId: string, patch?: Partial<Draft>) => void;
  getDraftById: (draftId: string) => Draft | undefined;
  deleteDraft: (draftId: string) => void;
  duplicateDraft: (draftId: string) => Draft | null;
};

const AppStoreContext = createContext<AppStoreContextValue | null>(null);

function parseStoredValue<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeClientSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    readerJobTraits:
      settings.readerJobTraits.trim() && settings.readerJobTraits.trim() !== "产品经理"
        ? settings.readerJobTraits.trim()
        : defaultSettings.readerJobTraits,
  };
}

function normalizeDraft(settings: AppSettings, draft: Draft): Draft {
  const domain = resolveArticleDomain(draft.domain);
  const body = decodeEscapedStructuralText(draft.body ?? "");
  return {
    ...draft,
    body,
    domain,
    words: calculateWords(body),
    formatting: draft.formatting ?? createFormattingForDomain(domain, settings.defaultTemplate),
  };
}

function normalizeTopic(topic: TopicSuggestion): TopicSuggestion {
  const inferredDomain = detectArticleDomain(topic.title, topic.tags, topic.source, topic.reason);
  const storedDomain = resolveArticleDomain(topic.domain);
  return {
    ...topic,
    domain: topic.domain && storedDomain !== "科技" ? storedDomain : inferredDomain,
  };
}

function compactTopicForStorage(topic: TopicSuggestion): StoredTopicSuggestion {
  const normalizedTopic = normalizeTopic(topic);

  return {
    ...normalizedTopic,
    reason: normalizedTopic.reason.trim().slice(0, 240),
    angles: normalizedTopic.angles
      .map((angle) => angle.trim())
      .filter(Boolean)
      .slice(0, 3),
    tags: normalizedTopic.tags
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 6),
  };
}

function persistCustomTopics(storage: Storage, topics: TopicSuggestion[]) {
  const compactTopics = dedupeTopics(topics).map(compactTopicForStorage);
  const candidates = [
    compactTopics,
    compactTopics.slice(0, 20),
    compactTopics.slice(0, 10),
    compactTopics.slice(0, 5),
  ];

  for (const candidate of candidates) {
    if (trySetStorageItem(storage, CUSTOM_TOPICS_KEY, JSON.stringify(candidate))) {
      return;
    }
  }

  try {
    storage.removeItem(CUSTOM_TOPICS_KEY);
  } catch (error) {
    console.error(`Failed to clear ${CUSTOM_TOPICS_KEY}:`, error);
  }
}

function dedupeTopics(items: TopicSuggestion[]) {
  const deduped = new Map<string, TopicSuggestion>();

  items.forEach((topic) => {
    const normalizedTopic = normalizeTopic(topic);
    const key = buildTopicIdentityKey(normalizedTopic);
    const existing = deduped.get(key);

    if (!existing || normalizedTopic.fit > existing.fit) {
      deduped.set(key, normalizedTopic);
    }
  });

  return Array.from(deduped.values());
}

function sortDraftsByUpdatedAt(items: Draft[]) {
  return [...items].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function mergeDraftCollections(serverDrafts: Draft[], localDrafts: Draft[]) {
  const merged = new Map(serverDrafts.map((draft) => [draft.id, draft]));
  const draftsToSync: Draft[] = [];

  localDrafts.forEach((draft) => {
    const existing = merged.get(draft.id);
    if (!existing) {
      merged.set(draft.id, draft);
      draftsToSync.push(draft);
      return;
    }

    if (new Date(draft.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      merged.set(draft.id, draft);
      draftsToSync.push(draft);
    }
  });

  return {
    mergedDrafts: sortDraftsByUpdatedAt(Array.from(merged.values())),
    draftsToSync,
  };
}

function mergeTopicCollections(serverTopics: TopicSuggestion[], localTopics: TopicSuggestion[]) {
  const merged = new Map(
    dedupeTopics(serverTopics).map((topic) => [buildTopicIdentityKey(topic), topic]),
  );
  const topicsToSync: TopicSuggestion[] = [];

  dedupeTopics(localTopics).forEach((topic) => {
    const normalizedTopic = normalizeTopic(topic);
    const topicKey = buildTopicIdentityKey(normalizedTopic);
    const existing = merged.get(topicKey);
    if (!existing) {
      merged.set(topicKey, normalizedTopic);
      topicsToSync.push(normalizedTopic);
    }
  });

  return {
    mergedTopics: Array.from(merged.values()),
    topicsToSync,
  };
}

function isLegacySeedDraft(draft: Draft) {
  return draft.topicId.startsWith("seed-") || draft.source === "历史草稿";
}

function createDraft(topic: TopicSuggestion, settings: AppSettings, scope: GenerateScope): Draft {
  const titleCandidates = createTitleCandidates(topic, settings);
  const outline = createOutline(topic);
  const summary = createSummary(topic, settings);
  const body = scope === "body" ? createBody(topic, settings) : "";
  const hasBody = Boolean(body.trim());

  return {
    id: `draft-${topic.id}`,
    domain: topic.domain,
    title: titleCandidates[0],
    titleCandidates,
    selectedAngle: topic.angles[0],
    status: hasBody ? "待修改" : "待生成",
    updatedAt: new Date().toISOString(),
    topic: topic.title,
    topicId: topic.id,
    tags: topic.tags,
    words: scope === "body" ? calculateWords(body) : 0,
    summary,
    outline: scope === "title" ? [] : outline,
    body,
    source: topic.source,
    formatting: createFormattingForDomain(topic.domain, settings.defaultTemplate),
  };
}

async function persistDraftSnapshot(draft: Draft) {
  await fetch("/api/drafts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ draft }),
  });
}

async function persistDraftPatch(draftId: string, patch: Partial<Draft>) {
  await fetch(`/api/drafts/${draftId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ patch }),
  });
}

async function persistTopicSnapshot(topic: TopicSuggestion) {
  await fetch("/api/topics", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ topic }),
  });
}

async function persistAppConfigPatch(patch: { settings?: AppSettings; selectedTopicId?: string | null }) {
  await fetch("/api/app-config", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ patch }),
  });
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [drafts, setDrafts] = useState<Draft[]>(defaultDrafts);
  const [customTopics, setCustomTopics] = useState<TopicSuggestion[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  useEffect(() => {
    const storage = getBrowserStorage();
    if (!storage) return;

    const storedSettings = normalizeClientSettings(
      parseStoredValue<AppSettings>(storage.getItem(SETTINGS_KEY), defaultSettings),
    );
    const storedDrafts = parseStoredValue<Draft[]>(storage.getItem(DRAFTS_KEY), defaultDrafts)
      .filter((draft) => !isLegacySeedDraft(draft));
    const storedCustomTopics = parseStoredValue<TopicSuggestion[]>(storage.getItem(CUSTOM_TOPICS_KEY), []).map(normalizeTopic);
    const storedSelectedTopicId = parseStoredValue<string | null>(storage.getItem(TOPIC_KEY), null);

    setSettings(storedSettings);
    setDrafts(storedDrafts.map((draft) => normalizeDraft(storedSettings, draft)));
    setCustomTopics(dedupeTopics(storedCustomTopics));
    setSelectedTopicId(storedSelectedTopicId);

    const loadRemoteState = async () => {
      try {
        const [draftsResponse, topicsResponse, appConfigResponse] = await Promise.all([
          fetch("/api/drafts", { cache: "no-store" }),
          fetch("/api/topics", { cache: "no-store" }),
          fetch("/api/app-config", { cache: "no-store" }),
        ]);

        if (draftsResponse.ok) {
          const draftsPayload = await draftsResponse.json();
          const serverDraftItems = Array.isArray(draftsPayload.items) ? (draftsPayload.items as Draft[]) : [];
          const normalizedServerDrafts = Array.isArray(draftsPayload.items)
            ? serverDraftItems.map((draft) => normalizeDraft(storedSettings, draft))
            : [];
          const normalizedLocalDrafts = storedDrafts.map((draft) => normalizeDraft(storedSettings, draft));
          const { mergedDrafts, draftsToSync } = mergeDraftCollections(normalizedServerDrafts, normalizedLocalDrafts);
          const draftsToRepair = serverDraftItems
            .map((draft, index) => {
              const normalizedDraft = normalizedServerDrafts[index];
              if (!normalizedDraft || normalizedDraft.body === draft.body) {
                return null;
              }

              return normalizedDraft;
            })
            .filter((draft): draft is Draft => Boolean(draft));

          setDrafts(mergedDrafts);

          if (draftsToSync.length || draftsToRepair.length) {
            await Promise.all(
              [...draftsToSync, ...draftsToRepair].map((draft) =>
                persistDraftSnapshot(draft).catch((error) => {
                  console.error("Failed to sync local draft:", error);
                }),
              ),
            );
          }
        }

        if (topicsResponse.ok) {
          const topicsPayload = await topicsResponse.json();
          const serverTopics = Array.isArray(topicsPayload.items) ? (topicsPayload.items as TopicSuggestion[]).map(normalizeTopic) : [];
          const { mergedTopics, topicsToSync } = mergeTopicCollections(serverTopics, storedCustomTopics);

          setCustomTopics(mergedTopics);

          if (topicsToSync.length) {
            await Promise.all(
              topicsToSync.map((topic) =>
                persistTopicSnapshot(topic).catch((error) => {
                  console.error("Failed to sync local topic:", error);
                }),
              ),
            );
          }
        }

        if (appConfigResponse.ok) {
          const configPayload = await appConfigResponse.json();
          const remoteConfig = configPayload.item as { settings?: AppSettings; selectedTopicId?: string | null } | null;

          if (remoteConfig?.settings) {
            setSettings(normalizeClientSettings(remoteConfig.settings));
          } else if (JSON.stringify(storedSettings) !== JSON.stringify(defaultSettings)) {
            await persistAppConfigPatch({ settings: storedSettings }).catch((error) => {
              console.error("Failed to sync local settings:", error);
            });
          }

          if (remoteConfig?.selectedTopicId !== undefined && remoteConfig?.selectedTopicId !== null) {
            setSelectedTopicId(remoteConfig.selectedTopicId);
          } else if (storedSelectedTopicId) {
            await persistAppConfigPatch({ selectedTopicId: storedSelectedTopicId }).catch((error) => {
              console.error("Failed to sync selected topic:", error);
            });
          }
        }
      } catch (error) {
        console.error("Failed to load remote app state:", error);
      }
    };

    void loadRemoteState();
  }, []);

  useEffect(() => {
    const storage = getBrowserStorage();
    if (!storage) return;
    trySetStorageItem(storage, SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const storage = getBrowserStorage();
    if (!storage) return;
    trySetStorageItem(storage, DRAFTS_KEY, JSON.stringify(drafts));
  }, [drafts]);

  useEffect(() => {
    const storage = getBrowserStorage();
    if (!storage) return;
    persistCustomTopics(storage, customTopics);
  }, [customTopics]);

  useEffect(() => {
    const storage = getBrowserStorage();
    if (!storage) return;
    trySetStorageItem(storage, TOPIC_KEY, JSON.stringify(selectedTopicId));
  }, [selectedTopicId]);

  const allTopics = useMemo(() => dedupeTopics([...customTopics, ...recommendedTopics]), [customTopics]);

  const selectedTopic = useMemo(
    () => allTopics.find((topic) => topic.id === selectedTopicId) ?? null,
    [allTopics, selectedTopicId],
  );

  const saveSettings = useCallback((nextSettings: AppSettings) => {
    const normalizedSettings = normalizeClientSettings(nextSettings);
    setSettings(normalizedSettings);

    void persistAppConfigPatch({ settings: normalizedSettings }).catch((error) => {
      console.error("Failed to save settings:", error);
    });
  }, []);

  const selectTopic = useCallback((topicId: string | null) => {
    setSelectedTopicId(topicId);

    void persistAppConfigPatch({ selectedTopicId: topicId }).catch((error) => {
      console.error("Failed to persist selected topic:", error);
    });
  }, []);

  const upsertTopic = useCallback((topic: TopicSuggestion) => {
    const normalizedTopic = normalizeTopic(topic);
    const normalizedTopicKey = buildTopicIdentityKey(normalizedTopic);
    const existingTopic = customTopics.find(
      (item) => item.id === normalizedTopic.id || buildTopicIdentityKey(item) === normalizedTopicKey,
    );
    const nextTopic = existingTopic ? { ...normalizedTopic, id: existingTopic.id } : normalizedTopic;

    setCustomTopics((currentTopics) => {
      const existingIndex = currentTopics.findIndex(
        (item) => item.id === nextTopic.id || buildTopicIdentityKey(item) === normalizedTopicKey,
      );
      if (existingIndex !== -1) {
        const nextTopics = [...currentTopics];
        nextTopics[existingIndex] = nextTopic;
        return dedupeTopics(nextTopics);
      }

      return dedupeTopics([nextTopic, ...currentTopics]).slice(0, 30);
    });

    setSelectedTopicId(nextTopic.id);

    void Promise.all([
      persistTopicSnapshot(nextTopic),
      persistAppConfigPatch({ selectedTopicId: nextTopic.id }),
    ]).catch((error) => {
      console.error("Failed to persist topic:", error);
    });

    return nextTopic;
  }, [customTopics]);

  const generateDraftFromTopic = useCallback(
    (topicId: string, scope: GenerateScope = "body") => {
      const topic = allTopics.find((item) => item.id === topicId);
      if (!topic) {
        throw new Error(`Topic not found: ${topicId}`);
      }

      const baseDraft = createDraft(topic, settings, scope);
      const existingDraft = drafts.find((draft) => draft.topicId === topicId);
      const nextDraft: Draft = existingDraft
          ? {
              ...existingDraft,
              titleCandidates: baseDraft.titleCandidates,
              title: scope === "title" ? baseDraft.titleCandidates[0] : existingDraft.title || baseDraft.title,
              summary: scope === "title" ? existingDraft.summary : baseDraft.summary,
              outline: scope === "outline" || scope === "body" ? baseDraft.outline : existingDraft.outline,
              body: scope === "body" ? baseDraft.body : existingDraft.body,
              status:
                scope === "body"
                  ? (baseDraft.body.trim() ? "待修改" : existingDraft.status === "已发布" ? "已发布" : "待生成")
                  : existingDraft.status === "已发布"
                    ? "已发布"
                    : "待生成",
              words: scope === "body" ? baseDraft.words : existingDraft.words,
              updatedAt: new Date().toISOString(),
              domain: baseDraft.domain,
            formatting: existingDraft.domain === baseDraft.domain ? existingDraft.formatting : baseDraft.formatting,
            selectedAngle: existingDraft.selectedAngle || baseDraft.selectedAngle,
          }
        : baseDraft;

      setDrafts((currentDrafts) =>
        existingDraft
          ? [nextDraft, ...currentDrafts.filter((draft) => draft.id !== existingDraft.id)]
          : [nextDraft, ...currentDrafts],
      );

      void persistDraftSnapshot(nextDraft).catch((error) => {
        console.error("Failed to persist generated draft:", error);
      });

      return nextDraft;
    },
    [allTopics, drafts, settings],
  );

  const updateDraft = useCallback((draftId: string, patch: Partial<Draft>) => {
    const existingDraft = drafts.find((draft) => draft.id === draftId);
    if (!existingDraft) return;

    const updatedAt = new Date().toISOString();
    const nextDomain = resolveArticleDomain(patch.domain ?? existingDraft.domain);
    const nextDraft: Draft = {
      ...existingDraft,
      ...patch,
      domain: nextDomain,
      formatting:
        patch.domain && patch.domain !== existingDraft.domain && !patch.formatting
          ? createFormattingForDomain(nextDomain, settings.defaultTemplate)
          : patch.formatting ?? existingDraft.formatting,
      words: patch.body ? calculateWords(patch.body) : patch.words ?? existingDraft.words,
      updatedAt,
    };

    setDrafts((currentDrafts) =>
      sortDraftsByUpdatedAt(currentDrafts.map((draft) => (draft.id === draftId ? nextDraft : draft))),
    );

    void persistDraftPatch(draftId, {
      ...patch,
      domain: nextDraft.domain,
      formatting: nextDraft.formatting,
      words: nextDraft.words,
      updatedAt,
    }).catch((error) => {
      console.error("Failed to update draft:", error);
    });
  }, [drafts, settings.defaultTemplate]);

  const updateDraftStatus = useCallback((draftId: string, status: DraftStatus) => {
    const existingDraft = drafts.find((draft) => draft.id === draftId);
    if (!existingDraft) return;

    const updatedAt = new Date().toISOString();
    const nextDraft: Draft = {
      ...existingDraft,
      status,
      updatedAt,
    };

    setDrafts((currentDrafts) =>
      sortDraftsByUpdatedAt(currentDrafts.map((draft) => (draft.id === draftId ? nextDraft : draft))),
    );

    void persistDraftPatch(draftId, {
      status,
      updatedAt,
    }).catch((error) => {
      console.error("Failed to update draft status:", error);
    });
  }, [drafts]);

  const submitDraftReview = useCallback((draftId: string, patch: Partial<Draft> = {}) => {
    updateDraft(draftId, {
      ...patch,
      status: "审核中",
    });
  }, [updateDraft]);

  const returnDraftToEditing = useCallback((draftId: string, patch: Partial<Draft> = {}) => {
    updateDraft(draftId, {
      ...patch,
      status: "待修改",
    });
  }, [updateDraft]);

  const publishDraft = useCallback((draftId: string, patch: Partial<Draft> = {}) => {
    const now = new Date().toISOString();
    updateDraft(draftId, {
      ...patch,
      status: "已发布",
      publishedAt: patch.publishedAt ?? now,
      lastExportedAt: patch.lastExportedAt ?? now,
    });
  }, [updateDraft]);

  const getDraftById = useCallback(
    (draftId: string) => drafts.find((draft) => draft.id === draftId),
    [drafts],
  );

  const deleteDraft = useCallback((draftId: string) => {
    setDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.id !== draftId));

    void fetch(`/api/drafts/${draftId}`, {
      method: "DELETE",
    }).catch((error) => {
      console.error("Failed to delete draft:", error);
    });
  }, []);

  const duplicateDraft = useCallback((draftId: string) => {
    const sourceDraft = drafts.find((draft) => draft.id === draftId);
    if (!sourceDraft) return null;

    const clonedDraft: Draft = {
      ...sourceDraft,
      id: `${sourceDraft.id}-copy-${Date.now()}`,
      title: `${sourceDraft.title}（副本）`,
      status: "待修改",
      publishedAt: undefined,
      publishedChannel: undefined,
      lastExportedAt: undefined,
      lastExportFormat: undefined,
      updatedAt: new Date().toISOString(),
    };

    setDrafts((currentDrafts) => [clonedDraft, ...currentDrafts]);

    void persistDraftSnapshot(clonedDraft).catch((error) => {
      console.error("Failed to duplicate draft:", error);
    });

    return clonedDraft;
  }, [drafts]);

  const value = useMemo<AppStoreContextValue>(
    () => ({
      settings,
      drafts,
      topics: allTopics,
      selectedTopic,
      saveSettings,
      selectTopic,
      upsertTopic,
      generateDraftFromTopic,
      updateDraft,
      updateDraftStatus,
      submitDraftReview,
      returnDraftToEditing,
      publishDraft,
      getDraftById,
      deleteDraft,
      duplicateDraft,
    }),
    [
      deleteDraft,
      duplicateDraft,
      drafts,
      generateDraftFromTopic,
      getDraftById,
      allTopics,
      saveSettings,
      selectTopic,
      selectedTopic,
      settings,
      upsertTopic,
      updateDraft,
      updateDraftStatus,
      submitDraftReview,
      returnDraftToEditing,
      publishDraft,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const context = useContext(AppStoreContext);

  if (!context) {
    throw new Error("useAppStore must be used within AppStoreProvider");
  }

  return context;
}
