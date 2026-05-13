// ai.js — AI API calls and offline tag suggestion
// Depends on: storage.js (getSettings), extraction.js (helper functions)

/**
 * suggestNodeMetadata(node, nodeType, pageMeta = null)
 * Unified AI suggestion engine for all node types: bookmark, concept, entity, keyword
 * 
 * @param {Object} node - Node object (bookmark/concept/entity/keyword)
 * @param {string} nodeType - Type of node ('bookmark'|'concept'|'entity'|'keyword')
 * @param {Object} pageMeta - Page metadata (optional, for bookmarks)
 * @returns {Promise<Object>} Metadata suggestions: {tags, summary} for bookmark, {definition} for concept, {profile, related_entities} for entity
 */
async function suggestNodeMetadata(node, nodeType, pageMeta = null) {
  const settings = await getSettings();
  if (!settings.aiEnabled || !settings.aiBaseUrl || !settings.aiModel) {
    throw new Error('AI not configured');
  }

  const isAnthropic = settings.aiBaseUrl.includes('anthropic.com');
  const isOpenRouter = settings.aiBaseUrl.includes('openrouter.ai');

  let prompt, endpoint, body, headers;

  if (nodeType === 'bookmark') {
    // Use existing callAI logic
    return callAI(node.title, node.url, pageMeta?._aiText || '');
  } else if (nodeType === 'concept') {
    // Generate definition for concept
    prompt = `You are helping organize a developer's knowledge base.

Given this concept: "${node.title}"
Context: Found in bookmarks about ${node.related_contexts || 'various topics'}.

Generate a brief definition (1-2 sentences) for this concept.
Return JSON with field "definition" only.

Example: {"definition": "A design pattern for..."}

Respond with ONLY valid JSON, no explanation.`;
  } else if (nodeType === 'entity') {
    // Generate profile for entity
    prompt = `You are helping organize a developer's knowledge base.

Given this entity: "${node.title}" (type: ${node.entity_type || 'unknown'})
Context: Mentioned in bookmarks about ${node.related_contexts || 'various topics'}.

Generate a brief profile (1-2 sentences) for this entity and suggest up to 3 related entities.
Return JSON with fields "profile" and "related_entities".

Example: {"profile": "A company that...", "related_entities": ["Entity1", "Entity2"]}

Respond with ONLY valid JSON, no explanation.`;
  } else if (nodeType === 'keyword') {
    // Generate context for keyword
    prompt = `You are helping organize a developer's knowledge base.

Given this keyword: "${node.title}"
Context: Found in bookmarks about ${node.related_contexts || 'various topics'}.

Generate a brief explanation (1 sentence) of what this keyword means in context.
Return JSON with field "explanation" only.

Example: {"explanation": "A technique for..."}

Respond with ONLY valid JSON, no explanation.`;
  } else {
    throw new Error('Unknown node type: ' + nodeType);
  }

  headers = { 'Content-Type': 'application/json' };

  if (isAnthropic) {
    headers['x-api-key'] = settings.aiApiKey;
    headers['anthropic-version'] = '2023-06-01';
    endpoint = `${settings.aiBaseUrl}/messages`;
    body = { model: settings.aiModel, max_tokens: 256, messages: [{ role: 'user', content: prompt }] };
  } else {
    headers['Authorization'] = `Bearer ${settings.aiApiKey}`;
    if (isOpenRouter) {
      headers['HTTP-Referer'] = 'https://github.com/bsquang/bookmark-vault';
      headers['X-Title'] = 'bookmark-vault';
    }
    endpoint = `${settings.aiBaseUrl}/chat/completions`;
    body = { model: settings.aiModel, max_tokens: 256, messages: [{ role: 'user', content: prompt }] };
  }

  const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API error ${res.status}`);

  const data = await res.json();
  const text = isAnthropic
    ? data.content?.[0]?.text
    : data.choices?.[0]?.message?.content;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid AI response');
  return JSON.parse(jsonMatch[0]);
}

/**
 * callAI(title, url, pageContent)
 * Calls configured AI provider, returns { tags, summary } or null.
 * Supports OpenAI-compatible APIs and Anthropic native API.
 */
async function callAI(title, url, pageContent) {
  const settings = await getSettings();
  if (!settings.aiEnabled || !settings.aiBaseUrl || !settings.aiModel) return null;

  const isAnthropic  = settings.aiBaseUrl.includes('anthropic.com');
  const isOpenRouter = settings.aiBaseUrl.includes('openrouter.ai');

  const contentSection = pageContent
    ? `\n\nPage metadata:\n"""\n${pageContent.slice(0, 500)}\n"""`
    : '';

  const prompt = `You are helping a developer organize their browser bookmarks.

Given this webpage:
Title: "${title}"
URL: "${url}"${contentSection}

Return a JSON object with:
1. "tags": array of 3-6 short technical tags (lowercase, no spaces, use hyphens). Focus on: programming language, framework, topic, type of content.
2. "summary": 1-2 sentences explaining what this page is about and why a developer would save it. Be specific and useful.${pageContent ? ' Use the page content to write an accurate summary.' : ''} Write in the same language as the title if non-English.

Respond with ONLY the JSON object, no explanation.
Example: {"tags":["rust","performance","async"],"summary":"Deep dive into async runtime internals in Rust, useful for understanding how tokio scheduler works under the hood."}`;

  const headers = { 'Content-Type': 'application/json' };
  let endpoint, body;

  if (isAnthropic) {
    headers['x-api-key'] = settings.aiApiKey;
    headers['anthropic-version'] = '2023-06-01';
    endpoint = `${settings.aiBaseUrl}/messages`;
    body = { model: settings.aiModel, max_tokens: 256, messages: [{ role: 'user', content: prompt }] };
  } else {
    headers['Authorization'] = `Bearer ${settings.aiApiKey}`;
    if (isOpenRouter) {
      headers['HTTP-Referer'] = 'https://github.com/bsquang/bookmark-vault';
      headers['X-Title'] = 'bookmark-vault';
    }
    endpoint = `${settings.aiBaseUrl}/chat/completions`;
    body = { model: settings.aiModel, max_tokens: 256, messages: [{ role: 'user', content: prompt }] };
  }

  const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API error ${res.status}`);

  const data = await res.json();
  const text = isAnthropic
    ? data.content?.[0]?.text
    : data.choices?.[0]?.message?.content;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid AI response');
  return JSON.parse(jsonMatch[0]);
}

/**
 * extractBookmarkMetadata(title, url, summary, pageMeta)
 * AI-powered extraction of rich metadata: concepts, entities, keywords, content analysis.
 * Returns {concepts, entities, keywords, key_statistics, purpose, thesis, key_message, 
 *          ai_extracted_fields, extraction_confidence, extraction_timestamp}
 * Uses helper functions from extraction.js; fallback if AI fails.
 */
async function extractBookmarkMetadata(title, url, summary, pageMeta, options = {}) {
  const strictAI = options?.strictAI === true;
  const settings = options?.settingsOverride || await getSettings();
  
  // Fallback: use offline extraction helpers
  const offlineFallback = () => {
    const text = `${title}\n${summary}`;
    return {
      concepts: extractConcepts(text),
      entities: extractEntities(text),
      keywords: extractKeywords(text),
      key_statistics: [],
      purpose: '',
      thesis: '',
      key_message: summary ? summary.split('.')[0].trim() : title,
      ai_extracted_fields: ['concepts', 'entities', 'keywords'],
      extraction_confidence: 0.5,
      extraction_timestamp: new Date().toISOString()
    };
  };
  
  // If AI not enabled, use offline extraction
  if (!settings.aiEnabled || !settings.aiBaseUrl || !settings.aiModel) {
    if (strictAI) {
      const err = new Error('AI not configured');
      err.code = 'ai-not-configured';
      throw err;
    }
    return offlineFallback();
  }
  
  try {
    const isAnthropic  = settings.aiBaseUrl.includes('anthropic.com');
    const isOpenRouter = settings.aiBaseUrl.includes('openrouter.ai');
    
    // Build AI text from available content
    const aiText = [title, summary, pageMeta?.description, pageMeta?.keywords]
      .filter(s => s)
      .join('\n')
      .slice(0, 1000);
    
    const prompt = `You are analyzing a saved webpage for knowledge extraction.

Title: "${title}"
URL: "${url}"
Summary: "${summary}"
Content: "${aiText}"

Extract and return ONLY valid JSON (no markdown, no explanation):
{
  "concepts": [
    {"name": "concept name", "relevance": 0.85, "type": "topic|theory|methodology|principle"}
  ],
  "entities": [
    {"name": "Entity Name", "type": "person|org|place|product", "value": "Optional value"}
  ],
  "key_statistics": [
    {"stat": "Statistic name", "value": "123", "unit": "unit", "confidence": 0.9}
  ],
  "purpose": "Why was this content created?",
  "thesis": "Main argument/claim in one sentence",
  "key_message": "Single most important takeaway",
  "confidence": 0.85
}

Return ONLY valid JSON, nothing else.`;

    const headers = { 'Content-Type': 'application/json' };
    let endpoint, body;

    if (isAnthropic) {
      headers['x-api-key'] = settings.aiApiKey;
      headers['anthropic-version'] = '2023-06-01';
      endpoint = `${settings.aiBaseUrl}/messages`;
      body = { model: settings.aiModel, max_tokens: 512, messages: [{ role: 'user', content: prompt }] };
    } else {
      headers['Authorization'] = `Bearer ${settings.aiApiKey}`;
      if (isOpenRouter) {
        headers['HTTP-Referer'] = 'https://github.com/bsquang/bookmark-vault';
        headers['X-Title'] = 'bookmark-vault';
      }
      endpoint = `${settings.aiBaseUrl}/chat/completions`;
      body = { model: settings.aiModel, max_tokens: 512, messages: [{ role: 'user', content: prompt }] };
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = setTimeout(() => controller?.abort(), 30000);
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller?.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      if (strictAI) {
        const err = new Error(`API error ${res.status}`);
        err.code = `http-${res.status}`;
        err.status = res.status;
        throw err;
      }
      console.warn(`AI extraction failed (${res.status}), using fallback`);
      return offlineFallback();
    }

    const data = await res.json();
    const text = isAnthropic
      ? data.content?.[0]?.text
      : data.choices?.[0]?.message?.content;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      if (strictAI) {
        const err = new Error('Invalid AI extraction response');
        err.code = 'invalid-response';
        throw err;
      }
      console.warn('Invalid AI extraction response, using fallback');
      return offlineFallback();
    }

    const extracted = JSON.parse(jsonMatch[0]);
    
    // Validate and sanitize response
    return {
      concepts: Array.isArray(extracted.concepts) ? extracted.concepts.slice(0, 7) : [],
      entities: Array.isArray(extracted.entities) ? extracted.entities.slice(0, 10) : [],
      keywords: Array.isArray(extracted.keywords) ? extracted.keywords.slice(0, 10) : [],
      key_statistics: Array.isArray(extracted.key_statistics) ? extracted.key_statistics.slice(0, 5) : [],
      purpose: String(extracted.purpose || '').substring(0, 200),
      thesis: String(extracted.thesis || '').substring(0, 300),
      key_message: String(extracted.key_message || summary || title).substring(0, 100),
      ai_extracted_fields: ['concepts', 'entities', 'key_statistics', 'purpose', 'thesis', 'key_message'],
      extraction_confidence: Math.min(1, Math.max(0, Number(extracted.confidence) || 0.7)),
      extraction_timestamp: new Date().toISOString()
    };
  } catch (error) {
    if (strictAI) throw error;
    console.warn('AI extraction error:', error.message);
    return offlineFallback();
  }
}

function detectAIProvider(settings = {}) {
  const baseUrl = String(settings.aiBaseUrl || '').toLowerCase();
  if (!baseUrl) return 'unknown';
  if (baseUrl.includes('anthropic.com')) return 'anthropic';
  if (baseUrl.includes('openrouter.ai')) return 'openrouter';
  if (baseUrl.includes('groq.com')) return 'groq';
  if (baseUrl.includes('localhost:11434') || baseUrl.includes('ollama')) return 'ollama';
  if (baseUrl.includes('openai.com')) return 'openai';
  return 'openai-compatible';
}

function getProviderRateCap(provider, settings = {}) {
  const defaults = {
    anthropic: 20,
    openai: 40,
    openrouter: 20,
    groq: 45,
    ollama: 120,
    'openai-compatible': 30,
    unknown: 20,
  };
  const configured = Number(settings.aiExtractRateCapPerMinute || 0);
  if (configured > 0) return configured;
  return defaults[provider] || defaults.unknown;
}

function classifyAIFailure(error, provider = 'unknown') {
  const code = String(error?.code || error?.status || 'unknown');
  const status = Number(error?.status || (String(code).startsWith('http-') ? Number(String(code).slice(5)) : NaN));
  if (code === 'ai-not-configured') {
    return { category: 'ai-failure', type: 'not-configured', code, retryable: false, provider };
  }
  if (code === 'AbortError' || code === 'timeout') {
    return { category: 'ai-failure', type: 'timeout', code: 'timeout', retryable: true, provider };
  }
  if (status === 429) {
    return { category: 'ai-failure', type: 'rate-limit', code: 'http-429', retryable: true, provider };
  }
  if (status >= 500) {
    return { category: 'ai-failure', type: 'server', code: `http-${status}`, retryable: true, provider };
  }
  if (status === 401 || status === 403) {
    return { category: 'ai-failure', type: 'auth', code: `http-${status}`, retryable: false, provider };
  }
  if (status >= 400 && status < 500) {
    return { category: 'ai-failure', type: 'request', code: `http-${status}`, retryable: false, provider };
  }
  if (code === 'invalid-response') {
    return { category: 'ai-failure', type: 'invalid-response', code, retryable: true, provider };
  }
  if (String(error?.message || '').toLowerCase().includes('network')) {
    return { category: 'ai-failure', type: 'network', code: 'network', retryable: true, provider };
  }
  return { category: 'ai-failure', type: 'unknown', code, retryable: true, provider };
}

function toRetryQueueItem(bookmark, failure, attempts, message) {
  return {
    category: 'ai-failure',
    type: failure.type,
    code: failure.code,
    retryable: failure.retryable,
    provider: failure.provider,
    bookmarkId: bookmark.id,
    url: bookmark.url,
    canonicalUrl: bookmark.url,
    message: message || 'AI extraction failed',
    attempts: Number(attempts || 0),
    timestamp: new Date().toISOString(),
    source: 'ai-extract-all',
    sourceDetail: '',
  };
}

async function runAIExtractAll(bookmarks, deps = {}) {
  const waitFn = deps.waitFn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const randomFn = deps.randomFn || Math.random;
  const nowFn = deps.nowFn || (() => Date.now());
  const updateBookmarkFn = deps.updateBookmarkFn || updateBookmark;
  const appendFailuresFn = deps.appendFailuresFn || (typeof appendLegacyIngestFailures === 'function' ? appendLegacyIngestFailures : null);
  const consumeFailuresFn = deps.consumeFailuresFn || (typeof consumeLegacyIngestFailures === 'function' ? consumeLegacyIngestFailures : null);
  const onProgress = deps.onProgress || (() => {});
  const settings = deps.settingsOverride || await getSettings();
  if (!settings.aiEnabled || !settings.aiBaseUrl || !settings.aiModel) {
    throw new Error('AI not configured');
  }

  const provider = detectAIProvider(settings);
  const rateCap = Math.max(1, Number(getProviderRateCap(provider, settings)));
  const minInterval = Math.ceil(60000 / rateCap);
  const configuredConcurrency = Math.max(1, Number(settings.aiExtractMaxConcurrency || 2));
  const providerConcurrencyCap = provider === 'ollama' ? 3 : 2;
  const maxConcurrency = Math.max(1, Math.min(configuredConcurrency, providerConcurrencyCap));
  const retryLimit = 2;
  const backoffBase = Math.max(250, Number(settings.aiExtractBackoffBaseMs || 1000));
  const breakerThreshold = Math.max(2, Number(settings.aiExtractCircuitBreakerThreshold || 5));
  const breakerCooldown = Math.max(3000, Number(settings.aiExtractCircuitBreakerCooldownMs || 30000));

  const retryableFailureIds = consumeFailuresFn
    ? (await consumeFailuresFn((f) => f?.category === 'ai-failure' && f?.retryable !== false)).map((f) => f.bookmarkId).filter(Boolean)
    : [];
  const retryableSet = new Set(retryableFailureIds);
  const queue = (Array.isArray(bookmarks) ? bookmarks : [])
    .filter((b) => b && b.id)
    .filter((b) => retryableSet.has(b.id) || !Array.isArray(b.ai_extracted_fields) || b.ai_extracted_fields.length === 0)
    .filter((b) => !!(b.ingest_snapshot || b.pageMeta || b.summary));

  const total = queue.length;
  let succeeded = 0;
  let failed = 0;
  let index = 0;
  let nextAllowedAt = 0;
  let consecutiveFailures = 0;
  let circuitOpenUntil = 0;
  let stopDueToCircuit = false;
  const retryQueue = [];

  async function acquireRateSlot() {
    const now = nowFn();
    const waitMs = Math.max(0, nextAllowedAt - now);
    nextAllowedAt = Math.max(now, nextAllowedAt) + minInterval;
    if (waitMs > 0) await waitFn(waitMs);
  }

  async function processOne(bookmark) {
    let lastError = null;
    for (let attempt = 0; attempt <= retryLimit; attempt++) {
      try {
        await acquireRateSlot();
        const extracted = await extractBookmarkMetadata(
          bookmark.title,
          bookmark.url,
          bookmark.summary,
          bookmark.pageMeta || bookmark.ingest_snapshot || null,
          { strictAI: true, settingsOverride: settings }
        );
        await updateBookmarkFn(bookmark.id, {
          concepts: extracted.concepts,
          entities: extracted.entities,
          keywords: extracted.keywords,
          key_statistics: extracted.key_statistics,
          purpose: extracted.purpose,
          thesis: extracted.thesis,
          key_message: extracted.key_message,
          ai_extracted_fields: extracted.ai_extracted_fields,
          extraction_confidence: extracted.extraction_confidence,
          extraction_timestamp: extracted.extraction_timestamp,
          ingest_ai_status: 'done',
          ingest_ai_last_error: '',
          ingest_ai_retry_count: attempt,
        });
        consecutiveFailures = 0;
        succeeded++;
        return;
      } catch (error) {
        lastError = error;
        const failure = classifyAIFailure(error, provider);
        if (!failure.retryable || attempt >= retryLimit) {
          failed++;
          consecutiveFailures += 1;
          retryQueue.push(toRetryQueueItem(bookmark, failure, attempt + 1, error?.message));
          await updateBookmarkFn(bookmark.id, {
            ingest_ai_status: 'failed',
            ingest_ai_last_error: error?.message || 'AI extraction failed',
            ingest_ai_retry_count: attempt + 1,
          });
          if (consecutiveFailures >= breakerThreshold) {
            circuitOpenUntil = nowFn() + breakerCooldown;
            stopDueToCircuit = true;
          }
          return;
        }
        const jitter = Math.floor(randomFn() * backoffBase);
        const backoffMs = Math.min(30000, (backoffBase * Math.pow(2, attempt)) + jitter);
        await waitFn(backoffMs);
      }
    }
    failed++;
    const classified = classifyAIFailure(lastError, provider);
    retryQueue.push(toRetryQueueItem(bookmark, classified, retryLimit + 1, lastError?.message));
  }

  async function worker() {
    while (index < queue.length && !stopDueToCircuit) {
      if (circuitOpenUntil > nowFn()) {
        stopDueToCircuit = true;
        break;
      }
      const i = index++;
      const item = queue[i];
      await processOne(item);
      onProgress({
        total,
        done: succeeded + failed,
        succeeded,
        failed,
        current: item?.url || '',
        provider,
        circuitOpen: stopDueToCircuit,
      });
    }
  }

  const workers = Array.from({ length: Math.min(maxConcurrency, Math.max(1, queue.length)) }, () => worker());
  await Promise.all(workers);

  if (stopDueToCircuit) {
    while (index < queue.length) {
      const item = queue[index++];
      retryQueue.push(toRetryQueueItem(item, {
        category: 'ai-failure',
        type: 'circuit-open',
        code: 'circuit-open',
        retryable: true,
        provider,
      }, 0, 'Circuit breaker open, queued for retry'));
    }
  }

  if (appendFailuresFn && retryQueue.length) {
    await appendFailuresFn(retryQueue);
  }

  return {
    provider,
    total,
    succeeded,
    failed: retryQueue.length,
    queued: retryQueue.length,
    circuitOpen: stopDueToCircuit,
    retryQueue,
  };
}

/**
 * suggestTags(title, url)
 * Offline keyword + domain matching, returns tag array. No API call.
 */
function suggestTags(title, url) {
  const text = (title + ' ' + url).toLowerCase();

  const tagMap = {
    'javascript':    ['javascript', 'js', '.js', 'node', 'npm', 'webpack', 'vite', 'eslint'],
    'typescript':    ['typescript', '.ts', 'tsx'],
    'python':        ['python', 'pip', 'django', 'flask', 'fastapi', 'pandas', 'numpy'],
    'rust':          ['rust', 'cargo', 'crates.io', 'rustlang'],
    'go':            ['golang', '/go/', 'goroutine', 'gopher'],
    'java':          ['java', 'spring', 'maven', 'gradle'],
    'css':           ['css', 'tailwind', 'sass', 'styled-component', 'postcss'],
    'ai':            ['openai', 'anthropic', 'claude', 'gpt', 'llm', 'machine learning', 'ml', 'neural', 'pytorch', 'tensorflow', 'hugging'],
    'database':      ['postgres', 'mysql', 'sqlite', 'mongodb', 'redis', 'supabase', 'prisma', 'sql'],
    'devops':        ['docker', 'kubernetes', 'k8s', 'ci/cd', 'github action', 'terraform', 'ansible', 'aws', 'gcp', 'azure'],
    'security':      ['auth', 'oauth', 'jwt', 'ssl', 'tls', 'vulnerability', 'cve', 'xss', 'csrf'],
    'performance':   ['performance', 'benchmark', 'profil', 'optimize', 'speed', 'latency'],
    'api':           ['api', 'rest', 'graphql', 'grpc', 'openapi', 'swagger', 'webhook'],
    'frontend':      ['react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt', 'remix'],
    'backend':       ['express', 'fastify', 'actix', 'gin', 'laravel', 'rails'],
    'testing':       ['test', 'jest', 'vitest', 'cypress', 'playwright', 'unit test', 'e2e'],
    'tools':         ['cli', 'terminal', 'vscode', 'neovim', 'tmux', 'git', 'github', 'gitlab'],
    'architecture':  ['architecture', 'microservice', 'monolith', 'design pattern', 'ddd', 'clean architecture', 'solid'],
    'open-source':   ['github.com', 'gitlab.com', 'open source', 'opensource', 'mit license'],
    'tutorial':      ['tutorial', 'guide', 'how to', 'getting started', 'introduction', 'beginner', 'learn'],
    'paper':         ['arxiv', 'paper', 'research', 'academic', 'doi.org'],
    'video':         ['youtube.com', 'youtu.be', 'twitch', 'loom'],
    'docs':          ['docs.', 'documentation', 'reference', 'spec', 'rfc'],
  };

  const siteMap = {
    'github.com':           'github',
    'stackoverflow.com':    'stackoverflow',
    'medium.com':           'medium',
    'dev.to':               'devto',
    'hackernews':           'hackernews',
    'news.ycombinator.com': 'hackernews',
    'reddit.com':           'reddit',
    'youtube.com':          'youtube',
    'youtu.be':             'youtube',
    'npmjs.com':            'npm',
    'pypi.org':             'pypi',
    'crates.io':            'crates-io',
    'hub.docker.com':       'dockerhub',
    'vercel.com':           'vercel',
    'netlify.com':          'netlify',
    'cloudflare.com':       'cloudflare',
    'linear.app':           'linear',
    'notion.so':            'notion',
    'figma.com':            'figma',
    'twitter.com':          'twitter',
    'x.com':                'twitter',
    'linkedin.com':         'linkedin',
    'producthunt.com':      'producthunt',
    'hashnode.com':         'hashnode',
    'substack.com':         'substack',
  };

  const matched = [];
  for (const [tag, keywords] of Object.entries(tagMap)) {
    if (keywords.some(kw => text.includes(kw))) matched.push(tag);
  }

  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    for (const [domain, tag] of Object.entries(siteMap)) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        matched.unshift(tag);
        break;
      }
    }
  } catch (_) {}

  return [...new Set(matched)].slice(0, 6);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    suggestNodeMetadata,
    callAI,
    extractBookmarkMetadata,
    detectAIProvider,
    getProviderRateCap,
    classifyAIFailure,
    runAIExtractAll,
    suggestTags,
  };
}
