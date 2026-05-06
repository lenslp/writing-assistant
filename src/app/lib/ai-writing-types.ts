import type { AppSettings, Draft, TopicSuggestion } from "./app-data";
import type { ArticleDomain } from "./content-domains";

export type AIWriteScope = "title" | "outline" | "body" | "full";

export type AITransformAction = "rewrite" | "expand" | "shorten";

export type HotTopicSourceContext = {
  title: string;
  source: string;
  url: string;
  summary: string;
  content: string;
  facts: string[];
  extractedAt: string;
};

export type DraftWritingSnapshot = Pick<
  Draft,
  | "id"
  | "domain"
  | "title"
  | "titleCandidates"
  | "selectedAngle"
  | "status"
  | "topic"
  | "topicId"
  | "tags"
  | "summary"
  | "outline"
  | "body"
  | "source"
>;

export type AIWriteGenerateRequest = {
  mode: "generate";
  scope: AIWriteScope;
  topic: TopicSuggestion;
  settings: AppSettings;
  domain: ArticleDomain;
  articleType: string;
  targetReader: string;
  targetWordCount: number;
  tone: string;
  draft?: DraftWritingSnapshot | null;
  sourceContext?: HotTopicSourceContext | null;
};

export type AIWriteTransformRequest = {
  mode: "transform";
  action: AITransformAction;
  topic: TopicSuggestion;
  settings: AppSettings;
  domain: ArticleDomain;
  articleType: string;
  targetReader: string;
  targetWordCount: number;
  tone: string;
  draft?: DraftWritingSnapshot | null;
  body: string;
  selectedText?: string;
  sourceContext?: HotTopicSourceContext | null;
};

export type AIWriteRequest = AIWriteGenerateRequest | AIWriteTransformRequest;

export type AIWriteResult = {
  title: string;
  titleCandidates: string[];
  selectedAngle: string;
  summary: string;
  outline: string[];
  body: string;
};

export type AIWriteWordCountStatus = {
  actual: number;
  min: number;
  max: number;
  target: number;
  adjusted: boolean;
  inRange: boolean;
  deviation?: "short" | "long" | "none";
};

export type AIWriteResponse = {
  configured: boolean;
  provider: string;
  model: string;
  result?: AIWriteResult;
  wordCountStatus?: AIWriteWordCountStatus;
  transformedText?: string;
  message?: string;
};
