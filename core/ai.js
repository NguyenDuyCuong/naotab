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
async function extractBookmarkMetadata(title, url, summary, pageMeta) {
  const settings = await getSettings();
  const extractedFields = [];
  let confidence = 0;
  
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

    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), timeout: 30000 });
    if (!res.ok) {
      console.warn(`AI extraction failed (${res.status}), using fallback`);
      return offlineFallback();
    }

    const data = await res.json();
    const text = isAnthropic
      ? data.content?.[0]?.text
      : data.choices?.[0]?.message?.content;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
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
    console.warn('AI extraction error:', error.message);
    return offlineFallback();
  }
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
