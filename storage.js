// storage.js — module quản lý bookmarks + settings trong chrome.storage.local

const STORAGE_KEY = 'tab_bookmarks';
const SETTINGS_KEY = 'tab_explorer_settings';

// ─── Settings ──────────────────────────────────────────────────────────────────

async function getSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return result[SETTINGS_KEY] || {
    aiEnabled: false,
    aiBaseUrl: '',
    aiApiKey: '',
    aiModel: '',
    featTags: true,
    featSummary: true,
  };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// ─── AI call ───────────────────────────────────────────────────────────────────

async function callAI(title, url, pageContent) {
  const settings = await getSettings();
  if (!settings.aiEnabled || !settings.aiBaseUrl || !settings.aiModel) return null;

  const isAnthropic = settings.aiBaseUrl.includes('anthropic.com');

  // Nếu có page content, dùng để AI đọc thực sự — giới hạn ~3000 chars để tránh tốn token
  const contentSection = pageContent
    ? `\n\nPage content (first 3000 chars):\n"""\n${pageContent.slice(0, 3000)}\n"""`
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
    body = {
      model: settings.aiModel,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    };
  } else {
    headers['Authorization'] = `Bearer ${settings.aiApiKey}`;
    endpoint = `${settings.aiBaseUrl}/chat/completions`;
    body = {
      model: settings.aiModel,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`API error ${res.status}`);

  const data = await res.json();
  const text = isAnthropic
    ? data.content?.[0]?.text
    : data.choices?.[0]?.message?.content;

  // Parse JSON từ response (đề phòng model bọc trong markdown)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid AI response');
  return JSON.parse(jsonMatch[0]);
}

// Đọc tất cả bookmarks
async function getBookmarks() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

// Lưu một bookmark mới
async function saveBookmark({ url, title, reason, summary, tags, favIconUrl }) {
  const bookmarks = await getBookmarks();

  // Không lưu trùng URL
  const exists = bookmarks.find(b => b.url === url);
  if (exists) return { duplicate: true, bookmark: exists };

  const bookmark = {
    id: Date.now().toString(),
    url,
    title,
    reason,       // lý do lưu (do người dùng nhập)
    summary,      // tóm tắt (do AI hoặc người dùng nhập)
    tags,         // mảng string
    favIconUrl: favIconUrl || '',
    status: 'unread',   // unread | reading | done | revisit
    savedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  bookmarks.unshift(bookmark); // mới nhất lên đầu
  await chrome.storage.local.set({ [STORAGE_KEY]: bookmarks });
  return { duplicate: false, bookmark };
}

// Cập nhật bookmark (status, tags, reason, ...)
async function updateBookmark(id, changes) {
  const bookmarks = await getBookmarks();
  const idx = bookmarks.findIndex(b => b.id === id);
  if (idx === -1) return false;
  bookmarks[idx] = { ...bookmarks[idx], ...changes, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [STORAGE_KEY]: bookmarks });
  return true;
}

// Xóa bookmark
async function deleteBookmark(id) {
  const bookmarks = await getBookmarks();
  const filtered = bookmarks.filter(b => b.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

// Suggest tags từ title + URL (offline, không cần API)
function suggestTags(title, url) {
  const text = (title + ' ' + url).toLowerCase();
  const tagMap = {
    // Languages
    'javascript': ['javascript', 'js', '.js', 'node', 'npm', 'webpack', 'vite', 'eslint'],
    'typescript': ['typescript', '.ts', 'tsx'],
    'python': ['python', 'pip', 'django', 'flask', 'fastapi', 'pandas', 'numpy'],
    'rust': ['rust', 'cargo', 'crates.io', 'rustlang'],
    'go': ['golang', '/go/', 'goroutine', 'gopher'],
    'java': ['java', 'spring', 'maven', 'gradle'],
    'css': ['css', 'tailwind', 'sass', 'styled-component', 'postcss'],
    // Topics
    'ai': ['openai', 'anthropic', 'claude', 'gpt', 'llm', 'machine learning', 'ml', 'neural', 'pytorch', 'tensorflow', 'hugging'],
    'database': ['postgres', 'mysql', 'sqlite', 'mongodb', 'redis', 'supabase', 'prisma', 'sql'],
    'devops': ['docker', 'kubernetes', 'k8s', 'ci/cd', 'github action', 'terraform', 'ansible', 'aws', 'gcp', 'azure'],
    'security': ['auth', 'oauth', 'jwt', 'ssl', 'tls', 'vulnerability', 'cve', 'xss', 'csrf'],
    'performance': ['performance', 'benchmark', 'profil', 'optimize', 'speed', 'latency'],
    'api': ['api', 'rest', 'graphql', 'grpc', 'openapi', 'swagger', 'webhook'],
    'frontend': ['react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt', 'remix'],
    'backend': ['express', 'fastify', 'actix', 'gin', 'laravel', 'rails'],
    'testing': ['test', 'jest', 'vitest', 'cypress', 'playwright', 'unit test', 'e2e'],
    'tools': ['cli', 'terminal', 'vscode', 'neovim', 'tmux', 'git', 'github', 'gitlab'],
    'architecture': ['architecture', 'microservice', 'monolith', 'design pattern', 'ddd', 'clean architecture', 'solid'],
    'open-source': ['github.com', 'gitlab.com', 'open source', 'opensource', 'mit license'],
    'tutorial': ['tutorial', 'guide', 'how to', 'getting started', 'introduction', 'beginner', 'learn'],
    'paper': ['arxiv', 'paper', 'research', 'academic', 'doi.org'],
    'video': ['youtube.com', 'youtu.be', 'twitch', 'loom'],
    'docs': ['docs.', 'documentation', 'reference', 'spec', 'rfc'],
  };

  const matched = [];
  for (const [tag, keywords] of Object.entries(tagMap)) {
    if (keywords.some(kw => text.includes(kw))) {
      matched.push(tag);
    }
  }

  // Thêm domain làm tag nếu là GitHub repo
  try {
    const u = new URL(url);
    if (u.hostname === 'github.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) matched.push(`gh:${parts[0]}/${parts[1]}`);
    }
  } catch (_) {}

  return [...new Set(matched)].slice(0, 6);
}

// Export toàn bộ dạng JSON string
async function exportJSON() {
  const bookmarks = await getBookmarks();
  return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), bookmarks }, null, 2);
}

// Import từ JSON string (merge, không xóa cái cũ)
async function importJSON(jsonString) {
  const data = JSON.parse(jsonString);
  const incoming = data.bookmarks || data; // hỗ trợ cả array thô
  const existing = await getBookmarks();
  const existingUrls = new Set(existing.map(b => b.url));
  const newOnes = incoming.filter(b => !existingUrls.has(b.url));
  const merged = [...newOnes, ...existing];
  await chrome.storage.local.set({ [STORAGE_KEY]: merged });
  return { imported: newOnes.length, skipped: incoming.length - newOnes.length };
}

// ─── Export Obsidian Vault ──────────────────────────────────────────────────────
// Mỗi bookmark → 1 file .md với frontmatter chuẩn Obsidian
// Trả về object { filename -> content } để caller tạo ZIP

function bookmarkToObsidianMd(bookmark) {
  // Sanitize filename: bỏ ký tự đặc biệt, giữ chữ + số + space + gạch
  const safeName = (bookmark.title || 'Untitled')
    .replace(/[\/\\:*?"<>|#^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  const filename = safeName + '.md';

  // Tags dạng Obsidian: mảng YAML
  const tagsYaml = (bookmark.tags || []).length > 0
    ? '  - ' + bookmark.tags.join('\n  - ')
    : '';

  // Status map sang tiếng Anh chuẩn
  const statusMap = {
    unread: 'unread',
    reading: 'reading',
    done: 'done',
    revisit: 'revisit',
  };

  const savedAt = bookmark.savedAt
    ? bookmark.savedAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const updatedAt = bookmark.updatedAt
    ? bookmark.updatedAt.slice(0, 10)
    : savedAt;

  // Build frontmatter theo chuẩn Obsidian Properties (YAML)
  const frontmatter = [
    '---',
    `title: "${(bookmark.title || '').replace(/"/g, "'")}"`,
    `url: "${bookmark.url}"`,
    `tags:`,
    tagsYaml,
    `status: ${statusMap[bookmark.status] || 'unread'}`,
    `date_saved: ${savedAt}`,
    `date_updated: ${updatedAt}`,
    `source: naoTab`,
    '---',
  ].filter(line => line !== '').join('\n');

  // Body content
  const parts = [];

  // Title heading + link
  parts.push(`# [${bookmark.title || 'Untitled'}](${bookmark.url})\n`);

  // Summary block
  if (bookmark.summary) {
    parts.push(`## Summary\n\n${bookmark.summary}\n`);
  }

  // Why I saved this
  if (bookmark.reason) {
    parts.push(`## Why I saved this\n\n> ${bookmark.reason}\n`);
  }

  // Tags as wikilinks (Obsidian style)
  if (bookmark.tags && bookmark.tags.length > 0) {
    const tagLinks = bookmark.tags.map(t => `#${t}`).join(' ');
    parts.push(`## Tags\n\n${tagLinks}\n`);
  }

  // Metadata footer
  parts.push(`---\n*Saved via [naoTab](https://github.com/bsquang/naotab) on ${savedAt}*`);

  const body = parts.join('\n');
  const content = frontmatter + '\n\n' + body;

  return { filename, content };
}

async function exportObsidian() {
  const bookmarks = await getBookmarks();
  return bookmarks.map(b => bookmarkToObsidianMd(b));
}
