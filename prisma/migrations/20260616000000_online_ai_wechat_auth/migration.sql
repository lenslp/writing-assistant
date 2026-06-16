-- AlterTable
ALTER TABLE "drafts" DROP CONSTRAINT "drafts_pkey",
ADD COLUMN     "user_id" TEXT NOT NULL DEFAULT 'legacy-single-user',
ADD CONSTRAINT "drafts_pkey" PRIMARY KEY ("user_id", "id");

-- AlterTable
ALTER TABLE "topics" DROP CONSTRAINT "topics_pkey",
ADD COLUMN     "user_id" TEXT NOT NULL DEFAULT 'legacy-single-user',
ADD CONSTRAINT "topics_pkey" PRIMARY KEY ("user_id", "id");

-- AlterTable
ALTER TABLE "app_config" DROP CONSTRAINT "app_config_pkey",
ADD COLUMN     "user_id" TEXT NOT NULL DEFAULT 'legacy-single-user',
ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("user_id");

-- CreateTable
CREATE TABLE "user_ai_providers" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider_type" TEXT NOT NULL DEFAULT 'openai',
    "base_url" TEXT NOT NULL,
    "encrypted_api_key" TEXT NOT NULL,
    "api_key_masked" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "fast_model" TEXT NOT NULL DEFAULT '',
    "longform_model" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_ai_image_providers" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "encrypted_api_key" TEXT NOT NULL,
    "api_key_masked" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ai_image_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_quotas" (
    "user_id" TEXT NOT NULL,
    "monthly_token_limit" INTEGER NOT NULL DEFAULT 0,
    "monthly_image_limit" INTEGER NOT NULL DEFAULT 0,
    "used_tokens" INTEGER NOT NULL DEFAULT 0,
    "used_images" INTEGER NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_usage_quotas_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "image_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_authorized_accounts" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "authorizer_app_id" TEXT NOT NULL,
    "nick_name" TEXT NOT NULL DEFAULT '',
    "avatar_url" TEXT NOT NULL DEFAULT '',
    "principal_name" TEXT NOT NULL DEFAULT '',
    "service_type_info" INTEGER,
    "verify_type_info" INTEGER,
    "encrypted_authorizer_access_token" TEXT NOT NULL DEFAULT '',
    "encrypted_authorizer_refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "default_author" TEXT NOT NULL DEFAULT '',
    "content_source_url" TEXT NOT NULL DEFAULT '',
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_authorized_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_component_tickets" (
    "component_app_id" TEXT NOT NULL,
    "verify_ticket" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_component_tickets_pkey" PRIMARY KEY ("component_app_id")
);

-- CreateIndex
CREATE INDEX "user_ai_providers_user_id_is_active_idx" ON "user_ai_providers"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "user_ai_image_providers_user_id_is_active_idx" ON "user_ai_image_providers"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "ai_usage_logs_user_id_created_at_idx" ON "ai_usage_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "wechat_authorized_accounts_user_id_is_selected_idx" ON "wechat_authorized_accounts"("user_id", "is_selected");

-- CreateIndex
CREATE UNIQUE INDEX "wechat_authorized_accounts_user_id_authorizer_app_id_key" ON "wechat_authorized_accounts"("user_id", "authorizer_app_id");

-- CreateIndex
CREATE INDEX "drafts_user_id_updated_at_idx" ON "drafts"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "topics_user_id_updated_at_idx" ON "topics"("user_id", "updated_at" DESC);
