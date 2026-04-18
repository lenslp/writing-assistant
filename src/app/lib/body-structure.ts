const IMAGE_MARKDOWN_LINE_PATTERN = /^!\[(.*?)\]\((.+)\)$/;
const ESCAPED_NEWLINE_PATTERN = /\\r\\n|\\n/;
const ESCAPED_STRUCTURAL_MARKER_PATTERN =
  /\\n\\n(?:##\s+|!\[|\[图片占位|【金句】|【重点】|---|$)/;

export function decodeEscapedStructuralText(text: string) {
  let next = text;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const escapedNewlineCount = (next.match(/\\n/g) ?? []).length;
    const shouldDecode =
      escapedNewlineCount >= 2 || ESCAPED_STRUCTURAL_MARKER_PATTERN.test(next);

    if (!shouldDecode || !ESCAPED_NEWLINE_PATTERN.test(next)) {
      return next;
    }

    const decoded = next
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"');

    if (decoded === next) {
      return next;
    }

    next = decoded;
  }

  return next;
}

function isStandaloneBlockLine(line: string) {
  const trimmed = line.trim();
  return (
    /^##\s+/.test(trimmed) ||
    trimmed === "---" ||
    trimmed.startsWith("【金句】") ||
    trimmed.startsWith("【重点】") ||
    trimmed.startsWith("[图片占位") ||
    IMAGE_MARKDOWN_LINE_PATTERN.test(trimmed)
  );
}

export function normalizeStructuredBodyText(text: string) {
  const normalized = decodeEscapedStructuralText(text)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n");
  const lines = normalized.split("\n");
  const nextLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    if (!trimmed) {
      if (nextLines[nextLines.length - 1] !== "") {
        nextLines.push("");
      }
      continue;
    }

    const previous = nextLines[nextLines.length - 1];
    if (isStandaloneBlockLine(trimmed) && previous && previous !== "") {
      nextLines.push("");
    }

    nextLines.push(trimmed);

    const nextNonEmpty = lines
      .slice(index + 1)
      .map((line) => line.trim())
      .find(Boolean);

    if (isStandaloneBlockLine(trimmed) && nextNonEmpty) {
      nextLines.push("");
    }
  }

  return nextLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
