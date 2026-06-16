import { prisma, hasDatabaseUrl } from "./prisma";

type AIUsageSource = "user" | "platform" | "default";

type AIUsageInput = {
  userId?: string;
  source: AIUsageSource;
  provider: string;
  model: string;
  task: string;
  tokens?: number;
  imageCount?: number;
};

function getCurrentPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeCount(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 0;
}

async function readCurrentQuota(userId: string) {
  if (!hasDatabaseUrl()) return null;

  const period = getCurrentPeriod();
  const existing = await prisma.aIUsageQuota.findUnique({ where: { userId } }).catch((error) => {
    console.error("Failed to read AI usage quota:", error);
    return null;
  });
  if (!existing) return null;

  if (existing.period !== period) {
    return prisma.aIUsageQuota.update({
      where: { userId },
      data: {
        period,
        usedTokens: 0,
        usedImages: 0,
      },
    }).catch((error) => {
      console.error("Failed to reset AI usage quota period:", error);
      return null;
    });
  }

  return existing;
}

export async function assertPlatformAIQuota(input: {
  userId?: string;
  source: AIUsageSource;
  tokenCount?: number;
  imageCount?: number;
}) {
  if (!input.userId || input.source !== "platform" || !hasDatabaseUrl()) return;

  const quota = await readCurrentQuota(input.userId);
  if (!quota) return;

  const tokenCount = normalizeCount(input.tokenCount);
  const imageCount = normalizeCount(input.imageCount);

  if (quota.monthlyTokenLimit > 0 && quota.usedTokens + tokenCount > quota.monthlyTokenLimit) {
    throw new Error("本月平台 AI 额度已用完，请切换为自有 API Key 或联系管理员增加额度。");
  }

  if (quota.monthlyImageLimit > 0 && quota.usedImages + imageCount > quota.monthlyImageLimit) {
    throw new Error("本月平台 AI 图片额度已用完，请切换为自有 API Key 或联系管理员增加额度。");
  }
}

export async function recordAIUsage(input: AIUsageInput) {
  if (!input.userId || !hasDatabaseUrl()) return;

  const tokens = normalizeCount(input.tokens);
  const imageCount = normalizeCount(input.imageCount);
  const period = getCurrentPeriod();

  await prisma.aIUsageLog.create({
    data: {
      userId: input.userId,
      provider: input.provider,
      model: input.model,
      task: input.task,
      source: input.source,
      tokens,
      imageCount,
    },
  }).catch((error) => {
    console.error("Failed to create AI usage log:", error);
  });

  if (input.source !== "platform" || (!tokens && !imageCount)) return;

  await prisma.aIUsageQuota.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      period,
      usedTokens: tokens,
      usedImages: imageCount,
    },
    update: {
      period,
      usedTokens: { increment: tokens },
      usedImages: { increment: imageCount },
    },
  }).catch((error) => {
    console.error("Failed to update AI usage quota:", error);
  });
}
