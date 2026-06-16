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

function getMessage(error: unknown) {
  return error instanceof Error ? error.message.trim() : "";
}

export function getClientErrorMessage(error: unknown, fallback: string) {
  const message = getMessage(error);
  if (!message) return fallback;
  if (message.length > 180) return fallback;
  if (INTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return fallback;
  return message;
}
