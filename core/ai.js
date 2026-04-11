// ai.js — AI API calls and offline tag suggestion
// Depends on: storage.js (getSettings)

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
      headers['HTTP-Referer'] = 'https://github.com/bsquang/naotab';
      headers['X-Title'] = 'naoTab';
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
