const INTERNAL_ERROR_PATTERNS = [
  /\bprisma\b/i,
  /\binvocation\b/i,
  /\bP\d{4}\b/,
  /\btable\b/i,
  /\bcolumn\b/i,
  /\brelation\b/i,
  /\bdatabase\b/i,
  /\bdoes not exist\b/i,
  /\bpermission denied\b/i,
  /\bECONN(?:REFUSED|RESET)\b/i,
  /\bETIMEDOUT\b/i,
  /\bENOTFOUND\b/i,
  /\b[A-Z0-9_]{8,}\b/,
  /[`"'“”‘’]/,
  /\bat\s+\S+\s+\(/,
] as const;

const USER_SAFE_PREFIXES = [
  "请",
  "缺少",
  "无效",
  "当前",
  "本月",
  "暂时",
  "微信",
  "公众号",
  "AI",
  "图片",
  "标题",
  "正文",
  "推送",
  "上传",
  "保存",
  "删除",
  "切换",
  "读取",
  "连接",
] as const;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.trim() : "";
}

export function toPublicErrorMessage(error: unknown, fallback: string) {
  const message = getErrorMessage(error);
  if (!message) return fallback;

  if (message.length > 180) return fallback;
  if (INTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return fallback;
  if (USER_SAFE_PREFIXES.some((prefix) => message.startsWith(prefix))) return message;

  return fallback;
}

export function toPublicFailedSources(
  failedSources: unknown,
  fallbackError = "暂时不可用",
) {
  if (!Array.isArray(failedSources)) return [];

  return failedSources
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const source = typeof (item as { source?: unknown }).source === "string"
        ? (item as { source: string }).source.trim()
        : "";

      if (!source || source.length > 60) return null;

      return {
        source,
        error: fallbackError,
      };
    })
    .filter((item): item is { source: string; error: string } => Boolean(item));
}
