# AI Article Generation Prompt Pipeline Analysis

## Executive Summary

The writing assistant has a **multi-stage prompt construction pipeline** with significant rule duplication between system and user prompts. The pipeline is split into **three major pathways** (planning, drafting, generate) with **cascading prompt accumulation**.

---

## Part 1: Writing Tones Structure (writing-tones.ts)

### Type Definition
```typescript
type WritingTonePreset = {
  id: string;              // machine-readable identifier
  label: string;           // display name (Chinese)
  description: string;     // one-line description
  titleStrategy: string;   // title-specific guidance
  openingStrategy: string; // opening paragraph guidance
  paragraphRhythm: string; // rhythm/pacing guidance
  languageStyle: string;   // vocabulary/tone guidance
  emotionalTexture: string;// emotional tone guidance
  closingStyle: string;    // closing guidance
  transformFocus: string;  // specific focus for text transformation
  aliases: string[];       // alternative names for resolution
};
```

### All 5 Presets

| ID | Label | Description | Key Rules |
|---|---|---|---|
| **professional** | 专业理性 | 判断清晰、信息密度高，适合行业解读和趋势分析。 | Short paragraphs, logical progression, credible tone, executive direction |
| **sharp** | 犀利观点 | 观点更鲜明，适合输出态度、拆误区、做反常识表达。 | Fast rhythm, direct contrasts, clear stance, memorable closing line |
| **emotional** | 情绪共鸣 | 更贴近创作者和职场人的真实处境，适合共鸣型内容。 | Fragmented paragraphs, white space, emotional progression, grounding advice |
| **growth** | 增长操盘手 | 更像懂增长、懂运营的人在写，适合方法论和复盘内容。 | Problem-cause-action structure, operational focus, 2-3 action items in closing |
| **friendly** | 朋友式表达 | 更自然、更亲近，像懂行的朋友在把复杂问题讲明白。 | Natural flow, casual tone, maintains credibility, practical advice |

### Resolution Logic
- Matches against: `label`, `id`, and all `aliases`
- Case-insensitive normalization
- Fallback: `professional` preset (index 0)

---

## Part 2: Content Domains Structure (content-domains.ts)

### Type Definition
```typescript
type DomainConfig = {
  label: ArticleDomain;           // domain name
  icon: string;                   // emoji icon
  description: string;            // one-line description
  template: string;               // template style (5 options)
  colorScheme: string;            // color scheme (4 options)
  aliases: string[];              // alternative names
  writingFocus: string[];         // 4 writing focus areas
  promptHint: string;             // domain-specific prompt guidance
};
```

### All 7 Domains

| Domain | Icon | Key Aliases | WritingFocus | PromptHint |
|--------|------|-------------|---|---|
| **科技** | 🤖 | ai, 人工智能, 互联网, 产品, 数码, 大模型, 芯片, 开源 | 趋势判断, 产品解读, 用户价值, 行业影响 | Write technical change, product capability, industry impact, ordinary reader understanding |
| **教育** | 📚 | 教育, 学习, 家长, 成长, 考试, 升学, 课堂, 老师 | 方法建议, 认知升级, 案例启发, 成长路径 | Write methods, growth suggestions, parent perspective, executable steps |
| **旅游** | ✈️ | 旅游, 旅行, 酒店, 民宿, 景点, 出行, 攻略, 路线 | 行程路线, 体验感, 预算, 避坑建议 | Write location experience, route arrangement, budget info, real pitfall warnings |
| **情感** | 💕 | 情感, 恋爱, 婚姻, 关系, 治愈, 共鸣, 心理, 温暖 | 情绪共鸣, 关系判断, 沟通建议, 边界感 | Write emotion changes, relationship judgment, immersion, warm but clear expression |
| **社会** | 📰 | 社会, 民生, 新闻, 事件, 观察, 调查, 舆论, 搞笑 | 事件脉络, 现实影响, 公众情绪, 观点判断 | Write event background, real impact, public attention, clear judgment |
| **汽车** | 🚗 | 汽车, 新能源, 车型, suv, 轿车, 试驾, 评测, 配置, 续航 | 配置参数, 驾驶体验, 购车决策, 性价比判断 | Write parameters, experience, pros/cons, purchase decision advice |
| **其他** | 🧩 | 其他, 其它, 综合, 泛热点, 杂谈 | 信息提炼, 角度归纳, 读者价值, 跨领域连接 | Write clear events, core insights, what readers need to know, no forced categorization |

### Detection Logic
1. **Source hints** (highest priority): Match source URLs against known domains (36氪→科技, 马蜂窝→旅游, etc.)
2. **Keyword scoring**: Three tiers (strong=5pts, medium=3pts, weak=1pt) + regex patterns (6pts)
3. **Decision threshold**: Best score must be ≥6 AND (lead by ≥2 OR score ≥10)
4. **Social media fallback**: If source is 微博/抖音/头条, apply category-specific patterns
5. **Default**: 其他 (Other)

---

## Part 3: AI Writing Prompt Pipeline (ai-writing.ts)

### Prompt Types Overview

The file has **4 major prompt construction paths**:

1. **buildGenerateSystemPrompt** + **buildGenerateUserPrompt** → Single-shot generation
2. **buildPlanningSystemPrompt** + **buildPlanningUserPrompt** → Plan creation
3. **buildDraftingSystemPrompt** + **buildDraftingUserPrompt** → Body writing from plan
4. **buildTransformSystemPrompt** + **buildTransformUserPrompt** → Text rewriting

### Rule Functions and Line Counts

#### Rule Building Functions

| Function | Returns | Count | Description |
|----------|---------|-------|---|
| `buildHumanWritingRules()` | array | **6 lines** | General writing naturalness rules |
| `buildHumanTitleRules()` | array | **4 lines** | Title naturalness rules |
| `buildHumanSummaryRules()` | array | **3 lines** | Summary naturalness rules |
| `buildHumanBodyRules()` | array | **4 lines** | Body structure and naturalness rules |
| `buildDepthRules()` | array | **6 lines** | Article depth and substance rules |
| `buildOutlineDepthRules()` | array | **3 lines** | Outline structure depth rules |
| `buildReadableDepthRules()` | array | **6 lines** | Readability and accessibility rules |
| `buildFriendlyExplainerRules()` | array | **6 lines** | Conversational tone rules |
| `buildTonePromptSections(tone)` | object | **system: 7 lines**<br>**user: 8 lines** | Tone-specific guidance (returned separately for system vs user) |

---

### Exact Line Counts Per Prompt Type

#### 1. **buildGenerateSystemPrompt** (SINGLE-SHOT: Title/Outline/Body/Full)

```
Static lines: 11 hardcoded lines (line 639-662)
+ buildDepthRules():                    6 lines
+ buildReadableDepthRules():            6 lines
+ buildFriendlyExplainerRules():        6 lines
+ buildHumanWritingRules():             6 lines
+ buildHumanTitleRules():               4 lines
+ buildHumanSummaryRules():             3 lines
+ buildHumanBodyRules():                4 lines
+ buildTonePromptSections(tone).system: 7 lines
+ scopeInstruction[scope]:              1 line (varies by scope)
+ closing:                              1 line

TOTAL: 11 + 6 + 6 + 6 + 6 + 4 + 3 + 4 + 7 + 1 + 1 = 55 LINES
```

#### 2. **buildGenerateUserPrompt** (SINGLE-SHOT: Title/Outline/Body/Full)

```
Task description:                       1 line
Topic/domain/settings:                  13 lines (lines 734-748)
Tone sections:                          8 lines (from buildTonePromptSections.user)
Account/reader/CTA:                     3 lines
Source context:                         variable (0-5 lines from buildSourceContextPromptSections)
Scope-specific body instructions:       5 lines (when scope=body/full)
Rules aggregation:
  + buildHumanWritingRules():           6 lines
  + buildHumanTitleRules():             4 lines
  + buildHumanSummaryRules():           3 lines
  + buildHumanBodyRules():              4 lines (when scope=body/full)
Draft references:                       4 lines (optional)
JSON format specs & title specs:        7 lines
Outline/summary/title quality specs:    5 lines

TOTAL: ~1 + 13 + 8 + 3 + 3 + 5 + 6 + 4 + 3 + 4 + 4 + 7 + 5 = ~66 LINES (excluding source context)
```

#### 3. **buildPlanningSystemPrompt** (Planning only: Title/Summary/Outline)

```
Static lines: 6 hardcoded lines (line 794-805)
+ buildDepthRules():                    6 lines
+ buildReadableDepthRules():            6 lines
+ buildFriendlyExplainerRules():        6 lines
+ buildOutlineDepthRules():             3 lines
+ buildHumanWritingRules():             6 lines
+ buildHumanTitleRules():               4 lines
+ buildHumanSummaryRules():             3 lines
+ buildTonePromptSections(tone).system: 7 lines
+ closing:                              1 line

TOTAL: 6 + 6 + 6 + 6 + 3 + 6 + 4 + 3 + 7 + 1 = 48 LINES
```

#### 4. **buildPlanningUserPrompt** (Planning only: Title/Summary/Outline)

```
Task description:                       1 line
Topic/domain/settings:                  13 lines (lines 819-833)
Tone sections:                          8 lines (from buildTonePromptSections.user)
Source context:                         variable (0-5 lines)
Rules aggregation (duplicated):
  + buildDepthRules():                  6 lines
  + buildReadableDepthRules():          6 lines
  + buildFriendlyExplainerRules():      6 lines
  + buildOutlineDepthRules():           3 lines
  + buildHumanWritingRules():           6 lines
  + buildHumanTitleRules():             4 lines
  + buildHumanSummaryRules():           3 lines
Title specifications:                   9 lines (lines 845-853)
Outline specifications:                 3 lines
Draft references:                       3 lines (optional)
JSON format spec:                       1 line

TOTAL: ~1 + 13 + 8 + 3 + 6 + 6 + 6 + 3 + 6 + 4 + 3 + 9 + 3 + 3 + 1 = ~74 LINES
```

#### 5. **buildDraftingSystemPrompt** (Drafting body only)

```
Static lines: 10 hardcoded lines (line 862-877)
+ buildDepthRules():                    6 lines
+ buildReadableDepthRules():            6 lines
+ buildFriendlyExplainerRules():        6 lines
+ buildHumanWritingRules():             6 lines
+ buildHumanBodyRules():                4 lines
+ buildTonePromptSections(tone).system: 7 lines
+ closing:                              1 line

TOTAL: 10 + 6 + 6 + 6 + 6 + 4 + 7 + 1 = 46 LINES
```

#### 6. **buildDraftingUserPrompt** (Drafting body only)

```
Task description:                       1 line
Topic/domain/settings:                  11 lines (lines 892-902)
Tone sections:                          8 lines
Source context:                         variable (0-5 lines)
Plan reference:                         4 lines (title, summary, angle, outline)
Body specifications:                    8 lines (lines 911-922)
Rules aggregation:
  + buildDepthRules():                  6 lines
  + buildReadableDepthRules():          6 lines
  + buildFriendlyExplainerRules():      6 lines
  + buildHumanWritingRules():           6 lines
  + buildHumanBodyRules():              4 lines
Draft body reference:                   1 line
JSON format spec:                       1 line

TOTAL: ~1 + 11 + 8 + 3 + 4 + 8 + 6 + 6 + 6 + 6 + 4 + 1 + 1 = ~65 LINES
```

#### 7. **buildTransformSystemPrompt** (Text rewriting)

```
Static lines: 6 hardcoded lines (line 941-950)
+ buildDepthRules():                    6 lines
+ buildReadableDepthRules():            6 lines
+ buildFriendlyExplainerRules():        6 lines
+ buildHumanWritingRules():             6 lines
+ buildTonePromptSections(tone).system: 7 lines
+ closing:                              1 line

TOTAL: 6 + 6 + 6 + 6 + 6 + 7 + 1 = 38 LINES
```

#### 8. **buildTransformUserPrompt** (Text rewriting)

```
Task description:                       2 lines
Topic/domain/settings:                  11 lines (lines 966-976)
Tone sections:                          8 lines
Transform focus:                        2 lines
Rules (duplicated):
  + buildDepthRules():                  6 lines
  + buildReadableDepthRules():          6 lines
  + buildFriendlyExplainerRules():      6 lines
  + buildHumanWritingRules():           6 lines
Draft reference:                        2 lines
Source text reference:                  1 line
JSON format spec:                       1 line

TOTAL: ~2 + 11 + 8 + 2 + 6 + 6 + 6 + 6 + 2 + 1 + 1 = ~51 LINES
```

---

## Part 4: Rule Duplication Analysis

### Critical Overlaps Between System and User Prompts

#### **System Prompt Includes:**
- `buildDepthRules()` - 6 lines
- `buildReadableDepthRules()` - 6 lines
- `buildFriendlyExplainerRules()` - 6 lines
- `buildHumanWritingRules()` - 6 lines
- `buildHumanTitleRules()` - 4 lines
- `buildHumanSummaryRules()` - 3 lines
- `buildHumanBodyRules()` - 4 lines
- `buildTonePromptSections(tone).system` - 7 lines

#### **User Prompt ALSO Includes:**
- `buildHumanWritingRules()` - 6 lines ✗ DUPLICATE
- `buildHumanTitleRules()` - 4 lines ✗ DUPLICATE
- `buildHumanSummaryRules()` - 3 lines ✗ DUPLICATE
- `buildDepthRules()` - 6 lines ✗ DUPLICATE (in planning & drafting user)
- `buildReadableDepthRules()` - 6 lines ✗ DUPLICATE (in planning & drafting user)
- `buildFriendlyExplainerRules()` - 6 lines ✗ DUPLICATE (in planning & drafting user)

### Specific Duplication Points

#### In **buildGenerateUserPrompt** (lines 769-772):
```typescript
...buildHumanWritingRules(),      // Already in system (line 657)
...buildHumanTitleRules(),        // Already in system (line 658)
...buildHumanSummaryRules(),      // Already in system (line 659)
...(scope === "body" || scope === "full" ? buildHumanBodyRules() : []),  // Already in system (line 660)
```
**Duplicate lines: 17 total** (6+4+3+4)

#### In **buildPlanningUserPrompt** (lines 838-844):
```typescript
...buildDepthRules(),             // Already in system (line 799)
...buildReadableDepthRules(),     // Already in system (line 800)
...buildFriendlyExplainerRules(), // Already in system (line 801)
...buildOutlineDepthRules(),      // Already in system (line 802)
...buildHumanWritingRules(),      // Already in system (line 803)
...buildHumanTitleRules(),        // Already in system (line 804)
...buildHumanSummaryRules(),      // Already in system (line 805)
```
**Duplicate lines: 34 total** (6+6+6+3+6+4+3)

#### In **buildDraftingUserPrompt** (lines 917-921):
```typescript
...buildDepthRules(),             // Already in system (line 872)
...buildReadableDepthRules(),     // Already in system (line 873)
...buildFriendlyExplainerRules(), // Already in system (line 874)
...buildHumanWritingRules(),      // Already in system (line 875)
...buildHumanBodyRules(),         // Already in system (line 876)
```
**Duplicate lines: 28 total** (6+6+6+6+4)

#### In **buildTransformUserPrompt** (lines 981-984):
```typescript
...buildDepthRules(),             // Already in system (line 946)
...buildReadableDepthRules(),     // Already in system (line 947)
...buildFriendlyExplainerRules(), // Already in system (line 948)
...buildHumanWritingRules(),      // Already in system (line 949)
```
**Duplicate lines: 24 total** (6+6+6+6)

### Total Duplication Summary

| Function Call | Copies | Total Lines | Waste |
|---|---|---|---|
| `buildHumanWritingRules()` | 4x | 6×4 = 24 lines | Save 18 lines |
| `buildHumanTitleRules()` | 3x | 4×3 = 12 lines | Save 8 lines |
| `buildHumanSummaryRules()` | 3x | 3×3 = 9 lines | Save 6 lines |
| `buildHumanBodyRules()` | 3x | 4×3 = 12 lines | Save 8 lines |
| `buildDepthRules()` | 4x | 6×4 = 24 lines | Save 18 lines |
| `buildReadableDepthRules()` | 4x | 6×4 = 24 lines | Save 18 lines |
| `buildFriendlyExplainerRules()` | 4x | 6×4 = 24 lines | Save 18 lines |
| `buildOutlineDepthRules()` | 2x | 3×2 = 6 lines | Save 3 lines |

**TOTAL WASTED TOKENS: ~99 rule lines (plus encoding overhead)**

---

## Part 5: Tone Prompt Section Duplication

### buildTonePromptSections Returns Object:
```typescript
{
  preset,
  system: [7 lines],   // Preset-specific system guidance
  user: [8 lines],     // NEARLY IDENTICAL to system (same info, 8 vs 7)
}
```

### System Array (7 items):
```
1. 本次写作采用「${preset.label}」风格。${preset.description}
2. 标题策略：${preset.titleStrategy}
3. 开头方式：${preset.openingStrategy}
4. 段落节奏：${preset.paragraphRhythm}
5. 表达方式：${preset.languageStyle}
6. 情绪纹理：${preset.emotionalTexture}
7. 结尾方式：${preset.closingStyle}
```

### User Array (8 items):
```
1. 目标风格：${preset.label}
2. 风格说明：${preset.description}
3. 标题要求：${preset.titleStrategy}
4. 开头要求：${preset.openingStrategy}
5. 段落要求：${preset.paragraphRhythm}
6. 语言要求：${preset.languageStyle}
7. 情绪要求：${preset.emotionalTexture}
8. 收束要求：${preset.closingStyle}
```

**OBSERVATION**: Same 7 content fields, different framing ("策略" vs "要求"). Extra line 1 in user is just "目标风格".

**DUPLICATION: High - could be merged into single array with optional label prefix**

---

## Part 6: Token Budget Implications

### Typical Token Consumption Per Prompt Type

Assuming average token ≈ 1.3 characters (Chinese):

#### Generate (single-shot) - Full scope
- System: ~55 lines × 50 avg chars = 3,575 tokens
- User: ~66 lines × 50 avg chars = 4,290 tokens
- **Total: ~7,865 tokens**

#### Planning + Drafting (two-stage) - Full scope
- Planning system: ~48 lines × 50 = 3,120 tokens
- Planning user: ~74 lines × 50 = 4,810 tokens
- Drafting system: ~46 lines × 50 = 2,990 tokens
- Drafting user: ~65 lines × 50 = 4,225 tokens
- **Total: ~15,145 tokens (93% more than single-shot!)**

#### Redundancy Cost Per Pipeline Run
- Rule duplication waste: ~99 × 50 × 1.3 = **~6,435 extra tokens** per planning+drafting run
- Tone duplication: ~8 × 50 × 1.3 = **~520 extra tokens** per prompt

---

## Specific Recommendations for Redundancy Reduction

### Recommendation 1: Merge Rules into System-Only Prompt
**Impact: Save ~6,400 tokens per planning+drafting run**

Current approach: Rules in both system AND user
Better approach: Include rules only in system prompt

```typescript
// Instead of:
...buildHumanWritingRules(),  // in user
// In system we already have:
...buildHumanWritingRules(),  // in system

// Change user prompt to skip duplicated rules
```

**Lines saved:**
- Remove from `buildGenerateUserPrompt`: -17 lines
- Remove from `buildPlanningUserPrompt`: -34 lines
- Remove from `buildDraftingUserPrompt`: -28 lines
- Remove from `buildTransformUserPrompt`: -24 lines

**Total: ~100 lines saved = ~6,500 tokens**

### Recommendation 2: Unify Tone Prompts (System & User)
**Impact: Save ~520 tokens per prompt**

```typescript
// Instead of returning separate system/user arrays:
return {
  preset,
  lines: [
    `本次写作采用「${preset.label}」风格。${preset.description}`,
    `标题：${preset.titleStrategy}`,
    // ... rest
  ]
};

// Both system and user use same array
```

**Savings: ~8 lines × 50 chars × 1.3 = ~520 tokens per call**

### Recommendation 3: Extract Common Domain + Settings Section
**Impact: Save ~400 tokens per prompt**

Currently, every user prompt repeats:
```
文章领域：${resolvedDomain}
领域说明：${domainConfig.description}
领域重点：${domainConfig.writingFocus.join("、")}
领域提醒：${domainConfig.promptHint}
```

This appears in:
- `buildGenerateUserPrompt` (lines 735-738)
- `buildPlanningUserPrompt` (lines 820-823)
- `buildDraftingUserPrompt` (lines 893-896)
- `buildTransformUserPrompt` (lines 967-970)

**Create shared function:**
```typescript
function buildDomainContextPrompt(resolvedDomain, domainConfig) {
  return [
    `文章领域：${resolvedDomain}`,
    `领域说明：${domainConfig.description}`,
    `领域重点：${domainConfig.writingFocus.join("、")}`,
    `领域提醒：${domainConfig.promptHint}`,
  ];
}
```

**Savings: Extracted once, reused 4 times = save ~4 × 200 = ~800 tokens**

### Recommendation 4: Extract Account + Settings Context Section
**Impact: Save ~300 tokens per prompt**

Currently appears in 4 places (generate, planning, drafting, transform):
```
账号定位：${settings.accountPosition}
内容领域：${settings.contentAreas.join("、")} // (generate/planning only)
读者需求：${settings.readerNeeds}              // (planning only)
互动 CTA：${settings.ctaEngage}
```

**Create helper:**
```typescript
function buildAccountContextPrompt(settings, includeContentAreas = false) {
  return [
    `账号定位：${settings.accountPosition}`,
    ...(includeContentAreas ? [`内容领域：${settings.contentAreas.join("、")}`] : []),
    `读者需求：${settings.readerNeeds}`,
    `互动 CTA：${settings.ctaEngage}`,
  ].filter(Boolean);
}
```

---

## Part 7: Actual vs Target Prompt Structure

### Current State (Planning + Drafting path)

```
PLANNING CALL:
  System: [fixed lines] + [depth × 3] + [human × 4] + [tone system] = ~48 lines
  User:   [context] + [tone user] + [depth × 3] + [human × 4] + [specs] = ~74 lines
  
DRAFTING CALL:
  System: [fixed lines] + [depth × 3] + [human × 2] + [tone system] = ~46 lines
  User:   [context] + [tone user] + [depth × 3] + [human × 2] + [specs] = ~65 lines
```

### Optimized State (Target)

```
PLANNING CALL:
  System: [fixed lines] + [depth × 3] + [human × 4] + [tone] + [extraction helper] = ~50 lines
  User:   [context helpers] + [tone] + [specs] = ~30 lines  ← 60% reduction
  
DRAFTING CALL:
  System: [fixed lines] + [depth × 3] + [human × 2] + [tone] + [extraction helper] = ~48 lines
  User:   [context helpers] + [tone] + [specs] = ~25 lines  ← 62% reduction
```

---

## Summary Table: All Prompt Details

| Prompt Type | System Lines | User Lines | Total | Duplication | Waste |
|---|---|---|---|---|---|
| Generate (full) | 55 | 66 | 121 | 17 rules | ~1,100 tokens |
| Planning | 48 | 74 | 122 | 34 rules | ~2,200 tokens |
| Drafting | 46 | 65 | 111 | 28 rules | ~1,800 tokens |
| Transform | 38 | 51 | 89 | 24 rules | ~1,560 tokens |
| **Typical Pipeline** | - | - | **233** (plan+draft) | **62 rules** | **~4,000 tokens** |

