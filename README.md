
# 生成UI稿

这是从 Figma Make 导出后整理成的 `Next.js + Tailwind CSS` 项目。

原始设计文件：
`https://www.figma.com/design/2LMOhm8dUTPpkEVOQh4WOA/%E7%94%9F%E6%88%90UI%E7%A8%BF`

## 启动项目

```bash
npm install
npm run dev
```

默认访问：

`http://localhost:3000`

## 构建项目

```bash
npm run build
npm run start
```

## Supabase + Prisma 配置

项目已接入热点抓取接口，并已切换为 `Prisma + Supabase Postgres`。

环境变量如下：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
AI_API_KEY=
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen3.5-plus
AI_MODEL_FAST=qwen-turbo
AI_MODEL_LONGFORM=qwen3.5-plus
HOTLIST_ZHIHU_FALLBACK_URLS=
HOTLIST_DOUYIN_FALLBACK_URLS=
HOTLIST_TOUTIAO_FALLBACK_URLS=
HOTLIST_BAIDU_FALLBACK_URLS=
HOTLIST_RSSHUB_BASE_URLS=
ZHIHU_COOKIE=
```

AI 写作说明：

- `AI_API_KEY / AI_BASE_URL / AI_MODEL` 用于服务端写作成文接口 `/api/ai/write`
- 支持按任务拆模型：
  `AI_MODEL_FAST` 用于标题 / 大纲 / 局部改写，
  `AI_MODEL_LONGFORM` 用于正文 / 全文生成
- 也支持更细粒度的：
  `AI_MODEL_TITLE`、`AI_MODEL_OUTLINE`、`AI_MODEL_BODY`、`AI_MODEL_FULL`、`AI_MODEL_TRANSFORM`
- 也兼容 `OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL`
- 默认示例已切到千问 DashScope OpenAI 兼容接口
- 如果你使用 DeepSeek、OpenRouter、SiliconFlow、OpenAI 等 OpenAI 兼容服务，只需要替换 `AI_BASE_URL` 和 `AI_MODEL`
- 未配置 AI 环境变量时，页面仍可打开，但点击 AI 写作会收到明确报错提示

初始化数据库（二选一）：

1. **推荐**：配置好 `DATABASE_URL` 后执行 Prisma 迁移 / 推表
   ```bash
   npx prisma generate
   npx prisma db push
   ```
2. 或者继续在 Supabase SQL Editor 手动执行 `supabase/hot_topics.sql`

接口说明：

- `GET /api/hot-topics`：优先读取 Prisma 对应数据库，读不到时回退为实时抓取
- `POST /api/hot-topics/refresh`：实时抓取热点并尝试通过 Prisma 入库

当前已接入的抓取源：

- 微博热搜
- 知乎热榜（优先官方接口，失败自动回退）
- 抖音热搜（优先官方接口，失败自动回退）
- 今日头条热榜（优先官方接口，可配置 fallback）
- 百度热搜（API + HTML 回退）
- 36氪（RSS）
- 少数派（RSS）
- 爱范儿（RSS）

说明：

- 如果缺少 `DATABASE_URL`，系统仍能抓到实时热点，但不会真正写入数据库
- 热点中心页面已经改为读取真实接口数据
- 可通过 `HOTLIST_*_FALLBACK_URLS` 配置你自建聚合接口作为备源，多个地址用英文逗号分隔
- `HOTLIST_RSSHUB_BASE_URLS` 可用于补知乎 RSSHub 备源
- `ZHIHU_COOKIE` 可选；如果官方接口偶发风控，可填入浏览器登录态 Cookie 提升知乎抓取稳定性

## 当前页面

- `/` 工作台
- `/hot-topics` 热点中心
- `/article-analysis` 爆文分析
- `/topic-center` 选题中心
- `/writing` 写作生成
- `/format-editor` 排版编辑
- `/drafts` 草稿箱
- `/review-center` 审核中心
- `/published` 发布管理
- `/settings` 账号设置
