const LEGACY_INGEST_STATE_KEY = 'legacy_ingest_state_v2';
const LEGACY_INGEST_VERSION = 2;

const LEGACY_INGEST_DEFAULTS = Object.freeze({
  includeBookmarks: true,
  includeHistory: true,
  strategy: 'fetch-first', // fetch-first | hidden-tab | hybrid
  skipExisting: true,
  retryCount: 2,
  safeMode: true,
  batchSize: 200,
  maxConcurrency: 2,
  perItemTimeoutMs: 8000,
  checkpointInterval: 3,
});

const LEGACY_INGEST_LIMITS = Object.freeze({
  batchSize: { min: 25, max: 1000 },
  maxConcurrency: { min: 1, max: 6 },
  perItemTimeoutMs: { min: 1000, max: 30000 },
  checkpointInterval: { min: 1, max: 50 },
  retryCount: { min: 0, max: 5 },
});

const LEGACY_INGEST_TRANSITIONS = Object.freeze({
  idle: ['running'],
  running: ['paused', 'canceled', 'completed'],
  paused: ['running', 'canceled'],
  canceled: ['running'],
  completed: ['running'],
});

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'ref', 'ref_src', 'mkt_tok',
]);

let bookmarkCache = null;

function clampNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

function clampIngestOptions(raw = {}) {
  const merged = { ...LEGACY_INGEST_DEFAULTS, ...(raw || {}) };
  return {
    includeBookmarks: merged.includeBookmarks !== false,
    includeHistory: merged.includeHistory !== false,
    strategy: ['fetch-first', 'hidden-tab', 'hybrid', 'fetch-only', 'hidden-tab-only'].includes(merged.strategy)
      ? merged.strategy
      : 'fetch-first',
    skipExisting: merged.skipExisting !== false,
    retryCount: clampNumber(
      merged.retryCount,
      LEGACY_INGEST_DEFAULTS.retryCount,
      LEGACY_INGEST_LIMITS.retryCount.min,
      LEGACY_INGEST_LIMITS.retryCount.max
    ),
    safeMode: merged.safeMode !== false,
    batchSize: clampNumber(
      merged.batchSize,
      LEGACY_INGEST_DEFAULTS.batchSize,
      LEGACY_INGEST_LIMITS.batchSize.min,
      LEGACY_INGEST_LIMITS.batchSize.max
    ),
    maxConcurrency: clampNumber(
      merged.maxConcurrency,
      LEGACY_INGEST_DEFAULTS.maxConcurrency,
      LEGACY_INGEST_LIMITS.maxConcurrency.min,
      LEGACY_INGEST_LIMITS.maxConcurrency.max
    ),
    perItemTimeoutMs: clampNumber(
      merged.perItemTimeoutMs,
      LEGACY_INGEST_DEFAULTS.perItemTimeoutMs,
      LEGACY_INGEST_LIMITS.perItemTimeoutMs.min,
      LEGACY_INGEST_LIMITS.perItemTimeoutMs.max
    ),
    checkpointInterval: clampNumber(
      merged.checkpointInterval,
      LEGACY_INGEST_DEFAULTS.checkpointInterval,
      LEGACY_INGEST_LIMITS.checkpointInterval.min,
      LEGACY_INGEST_LIMITS.checkpointInterval.max
    ),
  };
}

function normalizeIngestUrl(input) {
  if (!input || typeof input !== 'string') return '';
  try {
    const url = new URL(input.trim());
    if (!/^https?:$/.test(url.protocol)) return '';
    url.hash = '';

    [...url.searchParams.keys()].forEach((key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    });

    if (url.pathname !== '/') {
      url.pathname = url.pathname.replace(/\/+$/, '');
      if (!url.pathname) url.pathname = '/';
    }
    const normalized = url.toString().replace(/\/$/, (m) => (url.pathname === '/' ? m : ''));
    return normalized;
  } catch (_) {
    return '';
  }
}

function mergeIngestSource(a, b) {
  const set = new Set(String(a || '').split('+').filter(Boolean));
  String(b || '').split('+').filter(Boolean).forEach((x) => set.add(x));
  if (set.size === 0) return 'manual';
  return [...set].sort().join('+');
}

function flattenBookmarkTree(nodes, parentPath = '') {
  if (!Array.isArray(nodes)) return [];
  const result = [];
  nodes.forEach((node) => {
    if (!node || typeof node !== 'object') return;
    const title = (node.title || '').trim();
    const folderPath = title ? (parentPath ? `${parentPath} / ${title}` : title) : parentPath;
    if (node.url) {
      result.push({
        title: title || node.url,
        url: node.url,
        source: 'bookmark',
        sourceDetail: parentPath,
        ingestSource: 'bookmark',
        canonicalUrl: normalizeIngestUrl(node.url),
      });
      return;
    }
    if (Array.isArray(node.children)) {
      result.push(...flattenBookmarkTree(node.children, folderPath));
    }
  });
  return result;
}

function dedupeIngestItems(items) {
  const map = new Map();
  const invalid = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const canonicalUrl = normalizeIngestUrl(item?.canonicalUrl || item?.url || '');
    if (!canonicalUrl) {
      invalid.push({
        title: item?.title || item?.url || '',
        url: item?.url || '',
        canonicalUrl: '',
        source: item?.source || 'unknown',
        sourceDetail: item?.sourceDetail || '',
        ingestSource: item?.ingestSource || item?.source || 'unknown',
      });
      return;
    }
    const existing = map.get(canonicalUrl);
    if (!existing) {
      map.set(canonicalUrl, {
        title: item?.title || canonicalUrl,
        url: item?.url || canonicalUrl,
        canonicalUrl,
        source: item?.source || 'unknown',
        sourceDetail: item?.sourceDetail || '',
        ingestSource: item?.ingestSource || item?.source || 'unknown',
      });
      return;
    }
    existing.ingestSource = mergeIngestSource(existing.ingestSource, item?.ingestSource || item?.source || '');
    if (!existing.sourceDetail && item?.sourceDetail) existing.sourceDetail = item.sourceDetail;
    if ((!existing.title || existing.title === canonicalUrl) && item?.title) existing.title = item.title;
  });
  return [...map.values(), ...invalid];
}

function makeInitialLegacyIngestState(rawOptions = {}) {
  const options = clampIngestOptions(rawOptions);
  return {
    version: LEGACY_INGEST_VERSION,
    status: 'idle',
    phase: 'ready',
    options,
    cursor: {
      bookmark: 0,
      history: null,
      source: options.includeBookmarks ? 'bookmark' : 'history',
      done: {
        bookmark: !options.includeBookmarks,
        history: !options.includeHistory,
      },
    },
    queue: [],
    queueCursor: 0,
    checkpoint: {
      sequence: 0,
      lastSavedAt: '',
    },
    stats: {
      total: 0,
      processed: 0,
      imported: 0,
      saved: 0,
      skipped: 0,
      failed: 0,
      batches: 0,
      currentUrl: '',
    },
    failures: [],
    startedAt: '',
    updatedAt: '',
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function canTransition(fromState, toState) {
  return (LEGACY_INGEST_TRANSITIONS[fromState] || []).includes(toState);
}

function toCheckpoint(state) {
  return {
    version: state.version,
    status: state.status,
    phase: state.phase,
    options: { ...state.options },
    cursor: cloneState(state.cursor),
    queue: Array.isArray(state.queue) ? cloneState(state.queue) : [],
    queueCursor: Number(state.queueCursor || 0),
    checkpoint: cloneState(state.checkpoint),
    stats: cloneState(state.stats),
    failures: cloneState(state.failures),
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
  };
}

function mergeCheckpoint(baseState, checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') return baseState;
  const merged = {
    ...baseState,
    version: checkpoint.version || baseState.version,
    status: checkpoint.status || baseState.status,
    phase: checkpoint.phase || baseState.phase,
    options: clampIngestOptions({ ...baseState.options, ...(checkpoint.options || {}) }),
    checkpoint: { ...baseState.checkpoint, ...(checkpoint.checkpoint || {}) },
    stats: { ...baseState.stats, ...(checkpoint.stats || {}) },
    failures: Array.isArray(checkpoint.failures) ? checkpoint.failures : baseState.failures,
    startedAt: checkpoint.startedAt || baseState.startedAt,
    updatedAt: checkpoint.updatedAt || baseState.updatedAt,
  };

  if (Array.isArray(checkpoint.queue)) {
    merged.queue = checkpoint.queue;
  }
  if (typeof checkpoint.queueCursor === 'number') {
    merged.queueCursor = checkpoint.queueCursor;
  } else if (typeof checkpoint.cursor === 'number') {
    merged.queueCursor = checkpoint.cursor;
  }

  if (checkpoint.cursor && typeof checkpoint.cursor === 'object' && !Array.isArray(checkpoint.cursor)) {
    merged.cursor = { ...baseState.cursor, ...checkpoint.cursor };
  }

  return merged;
}

function chromeCall(fn, args = []) {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = fn(...args, (result) => {
        const err = chrome?.runtime?.lastError;
        if (err) return reject(new Error(err.message || 'Chrome API error'));
        resolve(result);
      });
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(resolve, reject);
      }
    } catch (e) {
      reject(e);
    }
  });
}

async function getNextBookmarkBatch(cursor, limit, chromeApi = (typeof chrome !== 'undefined' ? chrome : null)) {
  if (!chromeApi?.bookmarks?.getTree) {
    return { items: [], nextCursor: cursor || 0, done: true };
  }
  if (!bookmarkCache) {
    const tree = await chromeCall(chromeApi.bookmarks.getTree.bind(chromeApi.bookmarks), []);
    bookmarkCache = flattenBookmarkTree(tree);
  }
  const offset = Number.isFinite(cursor) ? cursor : 0;
  const items = bookmarkCache.slice(offset, offset + limit);
  const nextCursor = offset + items.length;
  const done = nextCursor >= bookmarkCache.length;
  if (done) bookmarkCache = null;
  return {
    items,
    nextCursor,
    done,
    totalEstimate: bookmarkCache ? bookmarkCache.length : nextCursor,
  };
}

async function getNextHistoryBatch(cursor, limit, chromeApi = (typeof chrome !== 'undefined' ? chrome : null)) {
  if (!chromeApi?.history?.search) {
    return { items: [], nextCursor: cursor, done: true };
  }
  const endTime = cursor?.endTime || Date.now();
  const raw = await chromeCall(chromeApi.history.search.bind(chromeApi.history), [{
    text: '',
    startTime: 0,
    endTime,
    maxResults: limit,
  }]);
  const rows = Array.isArray(raw) ? raw : [];
  const mapped = rows.map((r) => ({
    title: r.title || r.url || '',
    url: r.url || '',
    source: 'history',
    sourceDetail: '',
    ingestSource: 'history',
    canonicalUrl: normalizeIngestUrl(r.url),
    lastVisitTime: r.lastVisitTime || 0,
  }));
  const items = dedupeIngestItems(mapped);
  const oldest = rows.reduce((min, x) => Math.min(min, x.lastVisitTime || endTime), endTime);
  const nextCursor = rows.length ? { endTime: Math.max(0, oldest - 1) } : { endTime: 0 };
  const done = rows.length < limit || nextCursor.endTime <= 0;
  return { items, nextCursor, done };
}

function parseHtmlMetadata(html, url) {
  const text = String(html || '').slice(0, 400000);
  const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : '';

  const metas = {};
  const metaRegex = /<meta[^>]+(?:name|property)=["']([^"']+)["'][^>]*content=["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = metaRegex.exec(text)) !== null) {
    metas[String(m[1]).toLowerCase()] = String(m[2] || '').trim();
  }

  const pageMeta = {
    description: metas['description'] || metas['og:description'] || '',
    ogTitle: metas['og:title'] || '',
    keywords: metas['keywords'] || '',
    ogType: metas['og:type'] || '',
    author: metas['author'] || metas['article:author'] || '',
    siteName: metas['og:site_name'] || '',
    ogImage: metas['og:image'] || '',
    canonical: '',
    lang: '',
  };

  const canonicalMatch = text.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  pageMeta.canonical = canonicalMatch ? canonicalMatch[1].trim() : '';
  const langMatch = text.match(/<html[^>]+lang=["']([^"']+)["']/i);
  pageMeta.lang = langMatch ? langMatch[1].trim() : '';

  const nonEmptyMeta = Object.values(pageMeta).some((v) => !!v);
  if (!title && !nonEmptyMeta) {
    const err = new Error('Page appears JS-rendered or blocked');
    err.code = 'js-required';
    throw err;
  }

  pageMeta._aiText = [
    pageMeta.ogTitle ? `Title: ${pageMeta.ogTitle}` : '',
    pageMeta.description ? `Description: ${pageMeta.description}` : '',
    pageMeta.keywords ? `Keywords: ${pageMeta.keywords}` : '',
    pageMeta.ogType ? `Type: ${pageMeta.ogType}` : '',
    pageMeta.author ? `Author: ${pageMeta.author}` : '',
    pageMeta.siteName ? `Site: ${pageMeta.siteName}` : '',
  ].filter(Boolean).join('\n');

  const contentSample = extractTextSnippetFromHtml(text, 1200);
  const snapshot = {
    metaText: pageMeta._aiText || '',
    contentSample,
    capturedAt: new Date().toISOString(),
    sourceUrl: url,
  };
  const contentSignature = buildIngestContentSignature({
    title: title || url,
    pageMeta,
    snapshot,
    url,
  });

  return { title: title || url, pageMeta, snapshot, contentSignature };
}

function extractTextSnippetFromHtml(html, maxLen = 1200) {
  const text = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxLen);
}

function normalizeSnapshotText(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

function buildIngestContentSignature(payload = {}) {
  const title = normalizeSnapshotText(payload.title || '');
  const meta = payload.pageMeta || {};
  const snapshot = payload.snapshot || {};
  const parts = [
    title,
    normalizeSnapshotText(meta.description || ''),
    normalizeSnapshotText(meta.ogTitle || ''),
    normalizeSnapshotText(meta.keywords || ''),
    normalizeSnapshotText(snapshot.metaText || ''),
    normalizeSnapshotText(snapshot.contentSample || ''),
  ].filter(Boolean);
  if (!parts.length) return '';
  return parts.join('|').slice(0, 1200);
}

function buildBookmarkContentSignature(bookmark = {}) {
  return buildIngestContentSignature({
    title: bookmark.title || '',
    pageMeta: bookmark.pageMeta || {},
    snapshot: bookmark.ingest_snapshot || {},
    url: bookmark.url || '',
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promiseFactory, timeoutMs, code = 'timeout') {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(`Timed out after ${timeoutMs}ms`);
      err.code = code;
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promiseFactory(), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function extractViaFetch(url, fetchImpl, timeoutMs) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const response = await withTimeout(async () => {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller ? controller.signal : undefined,
    });
    return res;
  }, timeoutMs, 'fetch-timeout');

  if (!response || !response.ok) {
    const err = new Error(`HTTP ${response ? response.status : 'unknown'}`);
    err.code = response ? `http-${response.status}` : 'network';
    throw err;
  }

  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    const err = new Error(`Unsupported content type: ${contentType}`);
    err.code = 'non-html';
    throw err;
  }

  const html = await withTimeout(() => response.text(), timeoutMs, 'fetch-read-timeout');
  const parsed = parseHtmlMetadata(html, url);
  return { ...parsed, strategyUsed: 'fetch' };
}

async function extractViaHiddenTab(url, chromeApi, timeoutMs) {
  if (!chromeApi?.tabs?.create || !chromeApi?.scripting?.executeScript) {
    const err = new Error('Hidden tab extraction unavailable');
    err.code = 'hidden-tab-unavailable';
    throw err;
  }

  const tab = await chromeCall(chromeApi.tabs.create.bind(chromeApi.tabs), [{ url, active: false }]);
  const tabId = tab.id;
  try {
    await withTimeout(async () => {
      for (;;) {
        const current = await chromeCall(chromeApi.tabs.get.bind(chromeApi.tabs), [tabId]);
        if (current?.status === 'complete') break;
        await wait(250);
      }
    }, timeoutMs, 'hidden-tab-timeout');

    const res = await chromeCall(chromeApi.scripting.executeScript.bind(chromeApi.scripting), [{
      target: { tabId },
      func: () => {
        const getMeta = (selectors) => {
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            const val = el?.getAttribute('content') || el?.getAttribute('value');
            if (val && val.trim()) return val.trim();
          }
          return '';
        };
        const title = document.title || '';
        const pageMeta = {
          description: getMeta(['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']),
          ogTitle: getMeta(['meta[property="og:title"]', 'meta[name="twitter:title"]']),
          keywords: getMeta(['meta[name="keywords"]']),
          ogType: getMeta(['meta[property="og:type"]']),
          author: getMeta(['meta[name="author"]', 'meta[property="article:author"]']),
          siteName: getMeta(['meta[property="og:site_name"]']),
          ogImage: getMeta(['meta[property="og:image"]', 'meta[name="twitter:image"]']),
          lang: document.documentElement.lang || '',
          canonical: document.querySelector('link[rel="canonical"]')?.href || '',
        };
        pageMeta._aiText = [
          pageMeta.ogTitle ? `Title: ${pageMeta.ogTitle}` : '',
          pageMeta.description ? `Description: ${pageMeta.description}` : '',
          pageMeta.keywords ? `Keywords: ${pageMeta.keywords}` : '',
          pageMeta.ogType ? `Type: ${pageMeta.ogType}` : '',
          pageMeta.author ? `Author: ${pageMeta.author}` : '',
          pageMeta.siteName ? `Site: ${pageMeta.siteName}` : '',
        ].filter(Boolean).join('\n');
        return { title, pageMeta };
      },
    }]);

    const payload = res?.[0]?.result || {};
    if (!payload.title && !payload.pageMeta?.description) {
      const err = new Error('No content extracted from hidden tab');
      err.code = 'hidden-tab-empty';
      throw err;
    }
    return {
      title: payload.title || url,
      pageMeta: payload.pageMeta || {},
      snapshot: {
        metaText: payload.pageMeta?._aiText || '',
        contentSample: '',
        capturedAt: new Date().toISOString(),
        sourceUrl: url,
      },
      contentSignature: buildIngestContentSignature({
        title: payload.title || url,
        pageMeta: payload.pageMeta || {},
        snapshot: { metaText: payload.pageMeta?._aiText || '', contentSample: '' },
        url,
      }),
      strategyUsed: 'hidden-tab',
    };
  } finally {
    try {
      await chromeCall(chromeApi.tabs.remove.bind(chromeApi.tabs), [tabId]);
    } catch (_) {
      // ignore tab cleanup errors
    }
  }
}

async function extractForItem(item, options, deps) {
  const strategy = options.strategy || 'fetch-first';
  const timeoutMs = options.timeoutMs || options.perItemTimeoutMs || LEGACY_INGEST_DEFAULTS.perItemTimeoutMs;
  const fetchImpl = deps.fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  const chromeApi = deps.chromeApi || (typeof chrome !== 'undefined' ? chrome : null);

  const runFetch = async () => {
    if (!fetchImpl) {
      const err = new Error('Fetch API unavailable');
      err.code = 'fetch-unavailable';
      throw err;
    }
    return extractViaFetch(item.url, fetchImpl, timeoutMs);
  };
  const runHidden = async () => extractViaHiddenTab(item.url, chromeApi, timeoutMs);

  if (strategy === 'hidden-tab' || strategy === 'hidden-tab-only') return runHidden();
  if (strategy === 'fetch-only') return runFetch();
  if (strategy === 'hybrid') {
    try {
      return await runFetch();
    } catch (_) {
      return runHidden();
    }
  }
  return runFetch();
}

function classifyFailure(error) {
  const code = error?.code || 'unknown';
  const message = error?.message || 'Unknown error';
  if (code === 'fetch-timeout' || code === 'hidden-tab-timeout') {
    return { code: 'timeout', type: 'timeout', category: 'ingest-failure', retryable: true, message };
  }
  if (String(code).startsWith('http-')) {
    const status = Number(String(code).replace('http-', ''));
    const retryable = status === 429 || status >= 500;
    return { code, type: status === 429 ? 'rate-limit' : 'http', category: 'ingest-failure', retryable, message };
  }
  if (code === 'js-required') {
    return {
      code,
      type: 'js-required',
      category: 'ingest-failure',
      retryable: true,
      message: 'JavaScript-rendered page requires hidden-tab strategy',
    };
  }
  if (code === 'non-html') return { code, type: 'non-html', category: 'ingest-failure', retryable: false, message: 'Non-HTML resource' };
  return { code, type: 'unknown', category: 'ingest-failure', retryable: true, message };
}

async function processBatch(items, options, deps = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return { processed: 0, imported: 0, skipped: 0, failed: 0, failures: [] };

  const getBookmarksFn = deps.getBookmarksFn || (typeof getBookmarks === 'function' ? getBookmarks : async () => []);
  const saveBookmarkFn = deps.saveBookmarkFn || (typeof saveBookmark === 'function' ? saveBookmark : async () => ({ duplicate: true }));
  const suggestTagsFn = deps.suggestTagsFn || (typeof suggestTags === 'function' ? suggestTags : (() => []));
  const existingSet = deps.existingCanonicalSet || new Set((await getBookmarksFn()).map((b) => normalizeIngestUrl(b.url)));
  const inFlightCanonicalSet = deps.inFlightCanonicalSet || new Set();
  const existingBookmarks = deps.existingBookmarks || await getBookmarksFn();
  const existingSignatureSet = deps.existingSignatureSet || new Set(
    existingBookmarks
      .map((b) => String(b.ingest_content_signature || buildBookmarkContentSignature(b) || ''))
      .filter(Boolean)
  );

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  const maxConcurrency = Math.max(1, Number(options.maxConcurrency || 1));
  let index = 0;

  async function handleOne(item) {
    const canonical = normalizeIngestUrl(item?.canonicalUrl || item?.url || '');
    if (!canonical) {
      skipped++;
      return;
    }
    if (options.skipExisting && existingSet.has(canonical)) {
      skipped++;
      return;
    }
    if (inFlightCanonicalSet.has(canonical)) {
      skipped++;
      return;
    }
    inFlightCanonicalSet.add(canonical);

    let extracted = null;
    let lastErr = null;
    const retries = Math.max(0, Number(options.retryCount || 0));
    try {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          extracted = deps.extractUrlFn
            ? await deps.extractUrlFn({ ...item, canonicalUrl: canonical }, options)
            : await extractForItem({ ...item, canonicalUrl: canonical }, options, deps);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt < retries) {
            await wait(1000 * Math.pow(2, attempt));
          }
        }
      }

      if (!extracted) {
        const failure = classifyFailure(lastErr);
        failed++;
        failures.push({ url: item.url, canonicalUrl: canonical, ...failure, source: item.source || '' });
        return;
      }

      const contentSignature = String(
        extracted.contentSignature
        || buildIngestContentSignature({
          title: extracted.title || item.title || canonical,
          pageMeta: extracted.pageMeta || {},
          snapshot: extracted.snapshot || {},
          url: canonical,
        })
        || ''
      );
      if (contentSignature && existingSignatureSet.has(contentSignature)) {
        skipped++;
        return;
      }

      const suggestedTags = suggestTagsFn(extracted.title || item.title || canonical, canonical);
      const tags = Array.isArray(suggestedTags) ? suggestedTags : [];
      const saveResult = await saveBookmarkFn({
        url: canonical,
        title: extracted.title || item.title || canonical,
        reason: '',
        summary: extracted.summary || '',
        tags,
        favIconUrl: item.favIconUrl || '',
        pageMeta: extracted.pageMeta || null,
        ingest_source: item.ingestSource || item.source || 'history',
        ingest_source_detail: item.sourceDetail || '',
        ingest_imported_at: new Date().toISOString(),
        ingest_strategy_used: extracted.strategyUsed || options.strategy || 'fetch-first',
        ingest_snapshot: extracted.snapshot || null,
        ingest_content_signature: contentSignature,
        ingest_ai_status: extracted.snapshot ? 'pending' : 'idle',
        ingest_ai_last_error: '',
      });

      if (saveResult?.duplicate) {
        skipped++;
        existingSet.add(canonical);
        return;
      }
      imported++;
      existingSet.add(canonical);
      if (contentSignature) existingSignatureSet.add(contentSignature);
    } finally {
      inFlightCanonicalSet.delete(canonical);
    }
  }

  async function worker() {
    while (index < list.length) {
      const i = index++;
      await handleOne(list[i]);
    }
  }

  const workers = Array.from({ length: Math.min(maxConcurrency, list.length) }, () => worker());
  await Promise.all(workers);

  return {
    processed: list.length,
    imported,
    skipped,
    failed,
    failures,
  };
}

function createLegacyIngestRunner(deps = {}) {
  const storage = deps.storage || (typeof chrome !== 'undefined' ? chrome?.storage?.local : null);
  const chromeApi = deps.chromeApi || (typeof chrome !== 'undefined' ? chrome : null);
  const getBookmarksFn = deps.getBookmarksFn || (typeof getBookmarks === 'function' ? getBookmarks : async () => []);
  const saveBookmarkFn = deps.saveBookmarkFn || (typeof saveBookmark === 'function' ? saveBookmark : async () => ({ duplicate: true }));
  const suggestTagsFn = deps.suggestTagsFn || (typeof suggestTags === 'function' ? suggestTags : (() => []));
  const getNextBookmarkBatchFn = deps.getNextBookmarkBatchFn || ((cursor, limit) => getNextBookmarkBatch(cursor, limit, chromeApi));
  const getNextHistoryBatchFn = deps.getNextHistoryBatchFn || ((cursor, limit) => getNextHistoryBatch(cursor, limit, chromeApi));
  const processBatchFn = deps.processBatchFn || ((items, options, extraDeps = {}) => processBatch(items, options, {
    chromeApi,
    fetchImpl: deps.fetchImpl,
    getBookmarksFn,
    saveBookmarkFn,
    suggestTagsFn,
    extractUrlFn: deps.extractUrlFn,
    ...extraDeps,
  }));
  const updateLegacyStateFn = deps.updateLegacyStateFn || (typeof updateLegacyIngestState === 'function' ? updateLegacyIngestState : null);
  const getLegacyStateFn = deps.getLegacyStateFn || (typeof getLegacyIngestState === 'function' ? getLegacyIngestState : null);
  const buildQueueFn = deps.buildQueueFn || null;

  let state = makeInitialLegacyIngestState();
  let sharedCanonicalSet = null;
  let sharedSignatureSet = null;
  const inFlightCanonicalSet = new Set();
  let stopRequested = false;
  let loopPromise = null;
  const listeners = new Set();

  const emit = () => {
    listeners.forEach((listener) => listener(cloneState(state)));
    if (typeof deps.onStateChange === 'function') deps.onStateChange(cloneState(state));
  };

  const getState = () => cloneState(state);

  async function persistCheckpoint() {
    const snapshot = toCheckpoint(state);
    if (storage?.set) await storage.set({ [LEGACY_INGEST_STATE_KEY]: snapshot });
    if (updateLegacyStateFn) {
      await updateLegacyStateFn({
        legacyIngestState: state.status,
        legacyIngestPhase: state.phase,
        legacyIngestProcessed: state.stats.processed,
        legacyIngestTotal: state.stats.total,
        legacyIngestImported: state.stats.imported,
        legacyIngestSkipped: state.stats.skipped,
        legacyIngestFailed: state.stats.failed,
        legacyIngestCurrentUrl: state.stats.currentUrl,
        legacyIngestStartedAt: state.startedAt || '',
        legacyIngestUpdatedAt: state.updatedAt || '',
        legacyIngestLastError: state.failures[0]?.message || '',
        legacyIngestFailures: state.failures.slice(0, 200),
        legacyIngestCheckpointCursor: snapshot.cursor,
        legacyIngestCheckpointStats: snapshot.stats,
        legacyIngestCheckpointUpdatedAt: snapshot.updatedAt,
      });
    }
  }

  async function clearCheckpoint() {
    if (storage?.remove) await storage.remove(LEGACY_INGEST_STATE_KEY);
    if (updateLegacyStateFn) {
      await updateLegacyStateFn({
        legacyIngestCheckpointCursor: null,
        legacyIngestCheckpointStats: null,
        legacyIngestCheckpointUpdatedAt: '',
      });
    }
  }

  async function hydrateFromCheckpoint() {
    let checkpoint = null;
    if (storage?.get) {
      const raw = await storage.get(LEGACY_INGEST_STATE_KEY);
      checkpoint = raw?.[LEGACY_INGEST_STATE_KEY] || null;
    }
    if (!checkpoint && getLegacyStateFn) {
      const legacy = await getLegacyStateFn();
      if (legacy?.checkpointCursor || legacy?.checkpointStats) {
        checkpoint = {
          version: LEGACY_INGEST_VERSION,
          status: legacy.state || 'idle',
          phase: legacy.phase || 'ready',
          cursor: legacy.checkpointCursor || null,
          stats: legacy.checkpointStats || null,
          failures: legacy.failures || [],
          updatedAt: legacy.checkpointUpdatedAt || '',
        };
      }
    }
    if (checkpoint) {
      state = mergeCheckpoint(makeInitialLegacyIngestState(state.options), checkpoint);
      emit();
    }
    return getState();
  }

  function canMove(nextStatus) {
    return canTransition(state.status, nextStatus);
  }

  async function processSourceBatch(source) {
    const cursorKey = source === 'bookmark' ? 'bookmark' : 'history';
    const getter = source === 'bookmark' ? getNextBookmarkBatchFn : getNextHistoryBatchFn;
    const response = await getter(state.cursor[cursorKey], state.options.batchSize);
    const items = Array.isArray(response?.items) ? response.items : [];
    state.cursor[cursorKey] = response?.nextCursor;
    if (response?.done) state.cursor.done[cursorKey] = true;
    if (Number.isFinite(response?.totalEstimate)) {
      state.stats.total = Math.max(state.stats.total, Number(response.totalEstimate));
    } else if (items.length > 0) {
      state.stats.total = Math.max(state.stats.total, state.stats.processed + items.length);
    }

    if (!items.length) return false;
    state.phase = 'processing';
    state.stats.currentUrl = items[0]?.url || '';
    state.updatedAt = new Date().toISOString();
    emit();

    let existingBookmarks = null;
    if (!sharedCanonicalSet || !sharedSignatureSet) {
      existingBookmarks = await getBookmarksFn();
    }
    if (!sharedCanonicalSet) {
      sharedCanonicalSet = new Set(existingBookmarks.map((b) => normalizeIngestUrl(b.url)));
    }
    if (!sharedSignatureSet) {
      sharedSignatureSet = new Set(
        existingBookmarks
          .map((b) => String(b.ingest_content_signature || buildBookmarkContentSignature(b) || ''))
          .filter(Boolean)
      );
    }
    const result = await processBatchFn(items, state.options, {
      existingCanonicalSet: sharedCanonicalSet,
      existingSignatureSet: sharedSignatureSet,
      inFlightCanonicalSet,
      existingBookmarks: existingBookmarks || [],
    });
    state.stats.processed += Number(result?.processed || 0);
    state.stats.imported += Number(result?.imported || 0);
    state.stats.saved = state.stats.imported;
    state.stats.skipped += Number(result?.skipped || 0);
    state.stats.failed += Number(result?.failed || 0);
    state.stats.batches += 1;
    if (Array.isArray(result?.failures) && result.failures.length) {
      state.failures.unshift(...result.failures.slice(0, 25));
      state.failures = state.failures.slice(0, 200);
    }

    if (state.stats.batches % state.options.checkpointInterval === 0) {
      state.phase = 'checkpointing';
      state.checkpoint.sequence += 1;
      state.checkpoint.lastSavedAt = new Date().toISOString();
      state.updatedAt = new Date().toISOString();
      await persistCheckpoint();
      state.phase = 'running';
    }
    state.updatedAt = new Date().toISOString();
    emit();
    return true;
  }

  async function processQueueBatch() {
    const from = state.queueCursor;
    const to = Math.min(state.queue.length, from + state.options.batchSize);
    const batch = state.queue.slice(from, to);
    if (!batch.length) return false;

    state.phase = 'processing';
    state.stats.currentUrl = batch[0]?.url || '';
    state.updatedAt = new Date().toISOString();
    emit();

    let existingBookmarks = null;
    if (!sharedCanonicalSet || !sharedSignatureSet) {
      existingBookmarks = await getBookmarksFn();
    }
    if (!sharedCanonicalSet) {
      sharedCanonicalSet = new Set(existingBookmarks.map((b) => normalizeIngestUrl(b.url)));
    }
    if (!sharedSignatureSet) {
      sharedSignatureSet = new Set(
        existingBookmarks
          .map((b) => String(b.ingest_content_signature || buildBookmarkContentSignature(b) || ''))
          .filter(Boolean)
      );
    }
    const result = await processBatchFn(batch, state.options, {
      existingCanonicalSet: sharedCanonicalSet,
      existingSignatureSet: sharedSignatureSet,
      inFlightCanonicalSet,
      existingBookmarks: existingBookmarks || [],
    });
    state.queueCursor = to;
    state.stats.processed += Number(result?.processed || 0);
    state.stats.imported += Number(result?.imported || 0);
    state.stats.saved = state.stats.imported;
    state.stats.skipped += Number(result?.skipped || 0);
    state.stats.failed += Number(result?.failed || 0);
    state.stats.batches += 1;
    if (Array.isArray(result?.failures) && result.failures.length) {
      state.failures.unshift(...result.failures.slice(0, 25));
      state.failures = state.failures.slice(0, 200);
    }

    if (state.stats.batches % state.options.checkpointInterval === 0) {
      state.phase = 'checkpointing';
      state.checkpoint.sequence += 1;
      state.checkpoint.lastSavedAt = new Date().toISOString();
      state.updatedAt = new Date().toISOString();
      await persistCheckpoint();
      state.phase = 'running';
    }
    state.updatedAt = new Date().toISOString();
    emit();
    return true;
  }

  async function runLoop() {
    if (loopPromise) return loopPromise;
    loopPromise = (async () => {
      while (state.status === 'running' && !stopRequested) {
        if (buildQueueFn || state.queue.length > 0) {
          const hasMore = await processQueueBatch();
          if (!hasMore) break;
          continue;
        }
        const source = state.cursor.done.bookmark ? 'history' : 'bookmark';
        if (state.cursor.done.bookmark && state.cursor.done.history) break;
        const hasMore = await processSourceBatch(source);
        if (!hasMore && state.cursor.done.bookmark && state.cursor.done.history) break;
      }

      const hasQueueMode = buildQueueFn || state.queue.length > 0;
      const queueFinished = state.queue.length > 0 ? state.queueCursor >= state.queue.length : true;
      const streamFinished = state.cursor.done.bookmark && state.cursor.done.history;
      const finished = hasQueueMode ? queueFinished : streamFinished;
      if (state.status === 'running' && finished) {
        state.status = 'completed';
        state.phase = 'ready';
        state.stats.currentUrl = '';
        state.updatedAt = new Date().toISOString();
        await persistCheckpoint();
        emit();
      }
    })().finally(() => {
      loopPromise = null;
    });
    return loopPromise;
  }

  async function start(rawOptions = {}, runtimeOptions = {}) {
    const waitForCompletion = runtimeOptions.waitForCompletion !== false;
    const options = clampIngestOptions(rawOptions);
    if (!options.includeBookmarks && !options.includeHistory) {
      throw new Error('Please select at least one source');
    }

    stopRequested = false;
    sharedCanonicalSet = null;
    sharedSignatureSet = null;
    inFlightCanonicalSet.clear();
    state = makeInitialLegacyIngestState(options);
    state.startedAt = new Date().toISOString();
    state.updatedAt = state.startedAt;
    state.status = 'running';
    state.phase = 'running';

    if (buildQueueFn) {
      const rawQueue = await buildQueueFn(options);
      state.queue = dedupeIngestItems(rawQueue);
      state.stats.total = state.queue.length;
      state.cursor.done.bookmark = true;
      state.cursor.done.history = true;
    }

    await persistCheckpoint();
    emit();
    const loop = runLoop();
    if (waitForCompletion) await loop;
    return getState();
  }

  async function pause() {
    if (!canMove('paused')) return getState();
    stopRequested = true;
    state.status = 'paused';
    state.phase = 'paused';
    state.stats.currentUrl = '';
    state.updatedAt = new Date().toISOString();
    await persistCheckpoint();
    emit();
    return getState();
  }

  async function resume(runtimeOptions = {}) {
    if (state.status !== 'paused') return getState();
    const waitForCompletion = runtimeOptions.waitForCompletion !== false;
    stopRequested = false;
    state.status = 'running';
    state.phase = 'running';
    state.updatedAt = new Date().toISOString();
    await persistCheckpoint();
    emit();
    const loop = runLoop();
    if (waitForCompletion) await loop;
    return getState();
  }

  async function cancel() {
    if (state.status !== 'running' && state.status !== 'paused') return getState();
    stopRequested = true;
    state.status = 'canceled';
    state.phase = 'ready';
    state.stats.currentUrl = '';
    state.updatedAt = new Date().toISOString();
    await persistCheckpoint();
    emit();
    return getState();
  }

  async function retryFailed(runtimeOptions = {}) {
    if (!state.failures.length) return getState();
    const waitForCompletion = runtimeOptions.waitForCompletion !== false;
    const retryItems = state.failures.splice(0, state.failures.length).map((f) => ({
      title: f.title || f.url || '',
      url: f.url,
      canonicalUrl: normalizeIngestUrl(f.canonicalUrl || f.url),
      source: f.source || 'retry',
      sourceDetail: f.sourceDetail || '',
      ingestSource: f.ingestSource || f.source || 'retry',
    }));
    state.queue = dedupeIngestItems(retryItems);
    state.queueCursor = 0;
    state.stats.total = state.queue.length;
    state.stats.processed = 0;
    state.stats.imported = 0;
    state.stats.saved = 0;
    state.stats.skipped = 0;
    state.stats.failed = 0;
    state.stats.batches = 0;
    state.status = 'running';
    state.phase = 'running';
    state.updatedAt = new Date().toISOString();
    await persistCheckpoint();
    emit();
    const loop = runLoop();
    if (waitForCompletion) await loop;
    return getState();
  }

  return {
    start,
    pause,
    resume,
    cancel,
    retryFailed,
    hydrateFromCheckpoint,
    clearCheckpoint,
    saveCheckpoint: persistCheckpoint,
    getState,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LEGACY_INGEST_STATE_KEY,
    LEGACY_INGEST_VERSION,
    LEGACY_INGEST_DEFAULTS,
    LEGACY_INGEST_LIMITS,
    LEGACY_INGEST_TRANSITIONS,
    clampIngestOptions,
    normalizeIngestUrl,
    flattenBookmarkTree,
    dedupeIngestItems,
    makeInitialLegacyIngestState,
    toCheckpoint,
    mergeCheckpoint,
    getNextBookmarkBatch,
    getNextHistoryBatch,
    processBatch,
    classifyFailure,
    buildIngestContentSignature,
    createLegacyIngestRunner,
  };
}
