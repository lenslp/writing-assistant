# Article Generation Quality Analysis Report

## Executive Summary

The article generation system consists of 7 key files that work together to create structured content. The system has **good foundational architecture** but suffers from **several quality-related issues** that could significantly impact article generation reliability and consistency.

**Critical Issues Found: 5**
**Medium Issues Found: 8**
**Low Priority Issues Found: 6**

---

## 1. `src/app/lib/content-domains.ts` (231 lines)

### Purpose
Manages article domain configurations and domain detection logic for different content categories (科技, 教育, 旅游, 情感, 社会, 汽车, 其他).

### Key Functions

#### `resolveArticleDomain(input?: string | null): ArticleDomain`
- Maps user input to predefined domains via fuzzy matching
- Handles special cases (e.g., "搞笑" → "社会", "其它" → "其他")
- **ISSUE**: Returns "其他" as default with no validation feedback

#### `detectArticleDomain(title: string, tags: string[], source: string, summary: string): ArticleDomain`
- Complex scoring system (lines 179-231)
- Weights: aliases (2pts), strong keywords (5pts), medium (3pts), weak (1pt), patterns (6pts)
- Falls back to source pattern matching then keyword pattern matching

### Quality Issues

#### 🔴 **CRITICAL #1: Weak Domain Detection Logic**
- **Lines 215-217**: Confidence threshold is too low (score >= 6 and gap >= 2)
- Multiple domains can have similar scores, causing misclassification
- No tie-breaking mechanism when secondBest score equals best score
- **Impact**: Wrong domain → wrong template, wrong tone, wrong outline

**Example Problem:**
```javascript
// If "教育" scores 8 and "其他" scores 6:
// Detection succeeds, but gap is only 2 points
// With min 5 keywords, this is easily beaten by false positives
```

#### 🟡 **MEDIUM #2: Incomplete Domain Keyword Rules**
- Some domains underspecified (e.g., "其他" has no patterns)
- Pattern matching uses regex without case-insensitive flag in `domainKeywordRules`
- **Impact**: Lower accuracy for edge-case articles

#### 🟡 **MEDIUM #3: Hard-coded Source List**
- Lines 89-94 and 219-228: Hard-coded source patterns
- Inflexible when new platforms emerge or domain priorities change
- **Opportunity**: Should be configurable per account

---

## 2. `src/app/lib/writing-tones.ts` (97 lines)

### Purpose
Defines 5 writing tone presets (专业理性, 犀利观点, 情绪共鸣, 增长操盘手, 朋友式表达) with strategic guidance.

### Key Functions

#### `resolveWritingTone(tone: string): WritingTonePreset`
- Fuzzy matches user input against tone presets
- Returns first preset as fallback (index 0: "专业理性")

#### `buildWritingToneOptions(customTones: string[])`
- Deduplicates tone list
- Merges presets with custom user tones

### Quality Issues

#### 🟡 **MEDIUM #4: Insufficient Tone Guidance**
- Each preset has 7 fields (titleStrategy, openingStrategy, etc.) but guidance is **prose-based, not structured**
- AI model receives only descriptive text with no explicit patterns or examples
- **Impact**: Tone implementation inconsistent across generated outputs

**Example:** "专业理性" says "用词克制、干净，不喊口号" but provides no concrete examples of what to avoid/emulate.

#### 🟡 **MEDIUM #5: No Tone Validation**
- `resolveWritingTone()` always returns a tone (no error handling)
- No check if custom tones are actually valid instructions
- **Impact**: Typos in tone names silently default to "专业理性"

#### 🟡 **MEDIUM #6: Aliases Duplication**
- "朋友式表达" appears in both `label` and `aliases[0]`
- Unnecessary redundancy in resolution logic

---

## 3. `src/app/lib/hot-topic-context.ts` (338 lines)

### Purpose
Extracts and normalizes structured context from hot topic sources (web pages or cached data).

### Key Functions

#### `resolveHotTopicSourceContext(topic: TopicSuggestion): Promise<HotTopicSourceContext | null>`
- Fetches page HTML, extracts content via CSS selectors
- Caches results for 10 minutes (TTL = 10 * 60 * 1000)
- Falls back to cached hot topic data if fetch fails
- Extracts "facts" via scoring algorithm

#### `extractFactCards(topic, summary, content)`
- Scores sentences by keyword presence, date/number mentions, entity references
- Filters by minimum score (3) and deduplicates
- Returns up to 5 fact sentences

### Quality Issues

#### 🔴 **CRITICAL #2: Weak Fact Extraction Algorithm**
- **Lines 235-253**: Score function has arbitrary weights
  - Numbers: +3, Dates: +2, Sources/officials: +1-2, Length: ±2
  - Keywords: +1 to +3 depending on length
- No mechanism to verify facts are factually correct or unbiased
- **Impact**: Can extract misleading, low-quality "facts" as sources

**Example Failure:**
```javascript
// This sentence scores high but contains no real information:
"用户热议此事，很多网友表示支持" 
// - Contains "网友" (+1), "热议" pattern (+2), length 12-20 (+2) = 5 points
// But it adds zero informational value
```

#### 🟡 **MEDIUM #7: HTML Parsing Heuristics**
- **Lines 164-195**: Tries many selectors (article, main, .RichContent-inner, .content, body)
- Quality of extracted content depends on website structure
- No quality score on extracted content
- **Impact**: Article with broken selectors gets low-quality "context" for AI

#### 🟡 **MEDIUM #8: 2200 Character Content Limit Too Restrictive**
- **Line 6, 308**: `CONTENT_MAX_LENGTH = 2200`
- For complex topics, this is ~3-4 paragraphs max
- May truncate mid-sentence with "…" (line 25)
- **Impact**: AI model lacks sufficient context for nuanced articles

#### 🟡 **MEDIUM #9: Cache TTL vs. Hot Topics**
- 10-minute cache (line 9) is too long for actively trending topics
- Old context used for freshly-ranked topics
- **Opportunity**: TTL should be proportional to topic "heat" score

#### 🟡 **MEDIUM #10: No Duplicate Fact Filtering**
- **Lines 258-268**: Uses `indexOf(item) === index` for dedup
- But sentences with similar meaning but different wording aren't caught
- **Impact**: Fact cards may be redundant

---

## 4. `src/app/lib/hot-topic-sources.ts` (732 lines)

### Purpose
Scrapes hot topics from 9 sources (微博, 抖音, 知乎, 头条, 百度, 36氪, 少数派, 爱范儿) with fallback chains.

### Key Functions

#### `scrapeHotTopics()`
- Orchestrates fetching from all sources in parallel
- Deduplicates by title, applies content policy filter
- Limits: 100 items/source, 40 items total/source, 360 items globally

#### Helper functions per source
- `scrapeBaiduHot()` - tries API → HTML → fallback URLs
- `scrapeZhihuHot()` - tries official API → fallback API → RSS → fallback URLs
- `scrapeDouyinHot()` - similar pattern

### Quality Issues

#### 🟡 **MEDIUM #11: Heat Score Normalization Inconsistent**
- **Lines 46-49**: Arbitrary log-based normalization for large numbers
- No consensus on what "heat" means across sources (Baidu uses 100-10000, Douyin uses 0-100)
- **Impact**: Articles ranked wrong despite user preference

**Example:**
```javascript
// Baidu: rawValue=9500 → Math.log10(9500)*1000 = 3977
// But Baidu heat is already 0-10000, so this destroys ranking
normalizeHeat(9500, fallback) // Returns ~3977, loses granularity
```

#### 🟡 **MEDIUM #12: Trend Score Fixed-Window Assumptions**
- **Lines 158-163, 182**: Trend scores hardcoded assuming index position = recency
- `baseHeatMap[source] = X - index * Y` (e.g., 8000 - index * 210 for 知乎)
- Only works if list is always ranked by recency (not guaranteed)
- **Impact**: Old topics appear "trending" if API returns unsorted data

#### 🟡 **MEDIUM #13: No Spam/Low-Quality Filtering**
- Fetches up to 100 items/source but no quality gate
- Official APIs trusted to return good data, but user-generated content (Weibo, Douyin) not validated
- **Impact**: Clickbait/sensational topics treated equally to substantive ones

#### 🟡 **MEDIUM #14: Error Handling Too Permissive**
- **Lines 703-718**: Uses `Promise.allSettled()`, silently ignores failed sources
- All failures logged as `failedSources` but no retry logic
- **Impact**: If major source fails, quality degradation not obvious to user

---

## 5. `src/app/lib/body-structure.ts` (47 lines)

### Purpose
Normalizes article body text structure, consolidating whitespace and managing block-level elements.

### Key Functions

#### `normalizeStructuredBodyText(text: string)`
- Removes trailing spaces, normalizes newlines
- Inserts blank lines around block elements (##, ---, 【金句】, images)
- Deduplicates consecutive blank lines

### Quality Issues

#### 🟡 **MEDIUM #15: Block Element List Hard-coded**
- **Lines 6-11**: Specific markers for headings, quotes, images
- If AI generates different block syntax, not recognized
- **Opportunity**: Should accept configuration for custom block markers

#### 🟡 **MEDIUM #16: No Validation of Output Structure**
- Doesn't check if output is valid Markdown or acceptable format
- Doesn't measure "readability" (e.g., avg paragraph length)
- **Impact**: Normalized text could still be poorly structured

---

## 6. `src/app/lib/app-data.ts` (304 lines)

### Purpose
Provides core data generators: title candidates, outlines, summaries, and body text templates based on domain and settings.

### Key Functions

#### `createTitleCandidates(topic, settings) → string[]`
- **Lines 146-161**: Generates 5 title options:
  1. Original title
  2. "XXX，真正值得看的是什么"
  3. "关于XXX，很多人可能都看反了"
  4. Context-aware angle (parents/creators/writers)
  5. Tone-aware with focus + angle

#### `createOutline(topic) → string[]`
- **Lines 163-218**: Domain-specific outlines with 5 sections
- Each section interpolates topic angles
- Different structure per domain

#### `createSummary(topic, settings) → string`
- **Lines 220-233**: One-paragraph summary
- Interpolates: account position, topic angle, domain goal

#### `createBody(topic, settings) → string`
- **Lines 235-290**: Domain-specific body template
- Multiple paragraphs per domain (5 paras each)
- Explains structure and writing approach

### Quality Issues

#### 🔴 **CRITICAL #3: Title Generation Missing Reader Context**
- **Lines 146-161**: Reader label (line 149-152) is too simplistic
- Only checks for 3 audience types: "家长和学生", "做内容的人", "普通人"
- Ignores detailed `settings.readerJobTraits` and `settings.readerAgeRange`
- **Impact**: Titles don't reflect actual target reader, reducing engagement

**Example Problem:**
```javascript
// Settings: readerJobTraits = "25-35岁女性创业者，关注财务自由"
// But title generator only checks regex for keywords
// Generates titles for generic "普通人", loses relevance
```

#### 🔴 **CRITICAL #4: Static Template Logic Doesn't Adapt**
- **Lines 165-215, 237-287**: All outlines and bodies are static templates
- `topic.angles[0]`, `topic.angles[1]`, `topic.angles[2]` are simply interpolated
- **No logic to validate** if angles are actually suitable for the domain
- **Impact**: Outline structure forced on ill-fitting topics

**Example Failure:**
```javascript
// Topic: "如何制作面包" (旅游 domain by mistake)
// Outline forces: "路线亮点, 预算与体验, 避坑提醒"
// But angles might be: "配方技巧, 烤箱温度, 发酵时间"
// Result: Nonsensical structure
```

#### 🟡 **MEDIUM #17: `createTitleCandidates` Overweights Tone**
- Line 147: Only uses `settings.toneKeywords[0]` (first tone)
- Tone 2-5 options not used for title generation
- Title #5 won't vary if settings change tones

#### 🟡 **MEDIUM #18: Outline Section Names Are Hardcoded**
- **Lines 166-215**: Section names like "核心变化", "影响判断" are baked in
- Doesn't reflect actual article structure (e.g., could be 3 sections or 7 sections)
- **Opportunity**: Should use domain + topic complexity to determine section count

#### 🟡 **MEDIUM #19: Body Text Is Placeholder Guidance, Not Actual Content**
- **Lines 237-287**: Each domain's body is actually **instructions to AI** ("如果只停留在...", "更值得展开的是...")
- Labeled as "body" but not actual article text
- **Likely Intended**: Passed as "system prompt context", but code comment doesn't clarify
- **Impact**: Confusion about whether this is template or instruction

---

## 7. `src/app/components/WritingPage.tsx` (1464 lines)

### Purpose
Main UI component for article writing. Orchestrates generation, editing, formatting, and review workflow.

### Key Sections

#### State Management (Lines 127-195)
- 15+ useState calls for: draft data, generation status, tone/domain selection, etc.
- Good separation of concerns but **high cognitive load**

#### Generation Handler (Lines 516-586: `handleGenerate()`)
- Calls `/api/ai/write` with scope (title/outline/body/full)
- Processes `AIWriteResponse` and syncs to store
- Attempts auto-image insertion after generation

#### Transform Handler (Lines 588-660: `handleTransform()`)
- Supports rewrite/expand/shorten operations
- Preserves selected text range if partial edit

#### Autosave (Lines 789-854)
- 1.2s debounce after changes
- Only saves if content differs from saved draft
- Smart draft creation on first save

### Quality Issues

#### 🔴 **CRITICAL #5: AI Result Quality Not Validated**
- **Lines 310-328 (`syncAiResult()`)**: No validation that `result.title`, `result.outline`, `result.body` are non-empty
- **Line 311**: Status set to "待修改" even if body is empty
- **Lines 553-555**: Only checks `response.ok` and `payload.result` exists
- **Impact**: Empty/garbage AI output silently accepted

**Specific Problem:**
```javascript
// Line 312: setSelectedTitle(result.title)
// If AI returns title = "", component silently accepts it
// User sees blank title field, has to regenerate

// Line 326: status: result.body.trim() ? "待修改" : "待生成"
// Good attempt but doesn't validate outline or other fields
```

#### 🟡 **MEDIUM #20: No Generation Quality Metrics**
- No tracking of: generation time, retry count, user satisfaction
- Can't identify which domains/topics cause AI failures
- **Opportunity**: Add telemetry for quality improvement

#### 🟡 **MEDIUM #21: Image Insertion Error Handling Too Lenient**
- **Lines 342-484**: Tries real image search → falls back to AI image generation
- **Line 572**: Silently ignores background image errors
- No feedback if image insertion partially fails
- **Impact**: User doesn't know if final article has expected images

#### 🟡 **MEDIUM #22: Autosave Doesn't Validate Content Quality**
- **Lines 797-804**: `hasMeaningfulContent` check is weak (title OR summary OR body OR outline)
- Allows saving single-word content or garbage
- **Opportunity**: Should validate minimum content quality before saving

#### 🟡 **MEDIUM #23: No Conflict Detection**
- **Lines 677-680, 826-831**: Can't detect if draft was edited elsewhere
- If user edits article in another tab/device, changes silently lost
- **Opportunity**: Should implement optimistic locking or CRDTs

#### 🟡 **MEDIUM #24: Formatting Updates Redundant**
- **Lines 690-698, 820-823**: Identical code block copied 3 times
- `createFormattingForDomain()` called redundantly
- **Code Quality**: Should extract to helper function

#### 🟡 **MEDIUM #25: No Validation of User Input Constraints**
- Domain, tone, article type selections have no guards
- If invalid enum passed, component may crash
- **Opportunity**: Add TypeScript exhaustiveness checks

---

## Cross-Cutting Quality Issues

### 🔴 **Issue A: No Content Quality Scoring**
None of the generation layers validate output quality. Should implement:
- Minimum word count (e.g., 800+ for body)
- Sentence length distribution (80-120 chars ideal)
- Readability metrics (Flesch-Kincaid, keyword density)
- Fact claim density (how many sources cited per claim)

### 🔴 **Issue B: No A/B Testing Framework**
No mechanism to:
- Compare title effectiveness (clicks, engagement)
- Measure domain detection accuracy
- Track tone consistency across domains
- Identify which article templates perform best

### 🔴 **Issue C: Insufficient Error Recovery**
- AI generation failures fall back to static templates silently
- No "retry with different prompt" logic
- No graceful degradation (e.g., use smaller context if timeout)

### 🟡 **Issue D: Documentation Gap**
- No docstrings on complex functions
  - `detectArticleDomain()` (231 lines)
  - `scrapeHotTopics()` (732 lines)
  - `WritingPage` component (1464 lines)
- Domain "angles" concept never explained
- Article type (观点文 vs 趋势解读) selection criteria unclear

### 🟡 **Issue E: Magic Numbers Throughout**
- Line 215: threshold `6`, gap `2`
- Lines 158-163: heat fallback values (8000, 8300, 9000, 8400)
- Line 347: image limit per domain
- Line 1200: autosave debounce
- **Should**: Extract to configurable constants

---

## Recommendations by Priority

### 🔴 High Priority (Implement Within 1 Sprint)

1. **Add AI Result Validation** (`WritingPage.tsx` line 310-328)
   - Check title/outline/body not empty
   - Check body ≥ 500 characters
   - Log validation failures for debugging
   - Show user error if validation fails

2. **Improve Domain Detection Confidence** (`content-domains.ts` line 215-217)
   - Increase threshold to score ≥ 10
   - Increase gap requirement to ≥ 3
   - Add tie-breaking logic for equal scores
   - Return lower confidence domain with warning if unsure

3. **Fix Title Generation for Target Readers** (`app-data.ts` line 146-161)
   - Parse `settings.readerJobTraits` with NLP/keywords
   - Parse `settings.readerAgeRange` to customize title tone
   - Generate 2-3 reader-specific title variants
   - Example: "25-35 female entrepreneur" → add "财务自由", "副业", "爆发力" themes

4. **Validate Topic-Domain Fit** (`app-data.ts` line 163-218)
   - Add function `isTopicSuitableForDomain()` 
   - Check if `topic.angles` semantically match domain requirements
   - Warn user or auto-correct domain if mismatch detected

5. **Improve Fact Extraction Quality** (`hot-topic-context.ts` line 235-253)
   - Add minimum redundancy check (fact must contain ≥2 key concepts)
   - Filter out generic sentences (contains "网友", "热议" but no concrete info)
   - Add confidence score to each fact
   - Source fact origin (which paragraph/source)

### 🟡 Medium Priority (Next Sprint)

6. **Extract Magic Numbers to Config** (all files)
   - Create `src/app/lib/config.ts`
   - Move: domain detection thresholds, cache TTLs, content limits, autosave delays
   - Allow admin override per account

7. **Add Content Quality Metrics** (`WritingPage.tsx`)
   - Implement `calculateArticleQuality()` function
   - Check: word count, readability, keyword density, structure completeness
   - Show quality score before publishing
   - Block publish if score < 60/100

8. **Implement Telemetry** (`WritingPage.tsx`, `ai-writing.ts`)
   - Track: generation success rate, time elapsed, retry count per domain
   - Log: why domains/tones are selected
   - Create dashboard to identify failure patterns

9. **Improve Domain-Specific Templates** (`app-data.ts`)
   - Replace generic `topic.angles[0]` with domain-specific extractors
   - E.g., for 科技: extract "innovation", "disruption", "adoption"
   - For 教育: extract "pedagogy", "outcomes", "age-group"
   - Validate extracted angles exist before using

10. **Add Conflict Detection** (`WritingPage.tsx`, `draft-db.ts`)
    - Store `lastModifiedAt` + `lastModifiedBy` on draft
    - Warn user if draft edited elsewhere since load
    - Implement merge strategy (keep newer, keep both, manual merge)

### 💡 Low Priority (Future Roadmap)

11. Add A/B testing framework for titles
12. Implement prompt version control (track which prompt generated which article)
13. Add factuality checking integration (with external fact-check APIs)
14. Create domain-specific terminology dictionaries
15. Implement user feedback loop (thumbs up/down on generated content)

---

## Summary Table

| Issue | Severity | Component | Impact | Effort |
|-------|----------|-----------|--------|--------|
| No AI output validation | Critical | WritingPage | Accepts garbage content | Low |
| Weak domain detection | Critical | content-domains | Wrong template applied | Medium |
| Title ignores reader context | Critical | app-data | Low engagement | Medium |
| Static templates forced on topics | Critical | app-data | Nonsensical structure | High |
| No AI result validation | Critical | WritingPage | Accepts empty content | Low |
| Weak fact extraction | Medium | hot-topic-context | Misleading "facts" | Medium |
| Tone guidance not structured | Medium | writing-tones | Inconsistent tone | High |
| Content limit too restrictive | Medium | hot-topic-context | Insufficient context | Low |
| Heat score normalization broken | Medium | hot-topic-sources | Wrong ranking | Medium |
| No quality metrics | Medium | WritingPage | Can't improve | High |
| No conflict detection | Medium | WritingPage | Data loss risk | High |
| Missing documentation | Medium | All | Hard to maintain | Medium |

