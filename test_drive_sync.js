// test_drive_sync.js — Node tests for Google Drive backup/sync
const fs = require('fs');

const STORAGE_KEY = 'tab_bookmarks';
const SETTINGS_KEY = 'tab_explorer_settings';
const SETTINGS_DEFAULTS = {
  aiEnabled: false,
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  featTags: true,
  featSummary: true,
  driveBackupEnabled: false,
  driveBackupLastAt: '',
  driveBackupLastResult: '',
  driveBackupLastError: '',
  driveBackupLastFileId: '',
  driveBackupLastRestoreAt: '',
};

const store = {};
const driveFiles = [];
let fileCounter = 1;

function makeResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => payload,
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  };
}

global.fetch = async (url, init = {}) => {
  if (url.includes('/upload/drive/v3/files') && init.method === 'POST') {
    const body = String(init.body || '');
    const matches = body.match(/\{[\s\S]*?\}(?=\r\n--)/g) || [];
    const payload = matches[1] ? JSON.parse(matches[1]) : {};
    const now = new Date().toISOString();
    const file = {
      id: `file-${fileCounter++}`,
      name: `bookmark-vault-backup-${fileCounter}.json`,
      modifiedTime: now,
      size: String(body.length),
      payload,
    };
    driveFiles.push(file);
    return makeResponse(200, { id: file.id, name: file.name, modifiedTime: file.modifiedTime, size: file.size });
  }

  if (url.includes('/drive/v3/files?')) {
    const files = [...driveFiles]
      .sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)))
      .map(f => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, size: f.size }));
    return makeResponse(200, { files });
  }

  const mediaMatch = url.match(/\/drive\/v3\/files\/([^?]+)\?alt=media/);
  if (mediaMatch) {
    const fileId = decodeURIComponent(mediaMatch[1]);
    const found = driveFiles.find(f => f.id === fileId);
    if (!found) return makeResponse(404, { error: 'not found' });
    return makeResponse(200, found.payload);
  }

  return makeResponse(500, { error: 'unexpected fetch URL', url });
};

global.chrome = {
  runtime: {
    lastError: null,
    getManifest: () => ({
      version: '0.19.1-test',
      oauth2: {
        client_id: 'test-client-id.apps.googleusercontent.com',
        scopes: ['https://www.googleapis.com/auth/drive.appdata'],
      },
    }),
  },
  identity: {
    getAuthToken: (_opts, cb) => cb('token-test'),
    removeCachedAuthToken: (_opts, cb) => cb && cb(),
  },
  storage: {
    local: {
      async get(keys) {
        if (Array.isArray(keys)) {
          return keys.reduce((acc, k) => ({ ...acc, [k]: store[k] }), {});
        }
        if (typeof keys === 'string') return { [keys]: store[keys] };
        return { ...store };
      },
      async set(items) {
        Object.assign(store, items);
      },
      async remove(key) {
        delete store[key];
      },
    },
  },
};

eval(fs.readFileSync('core/schema.js', 'utf8'));
eval(fs.readFileSync('core/storage.js', 'utf8'));
eval(fs.readFileSync('core/sync/drive.js', 'utf8'));

let passed = 0;
let failed = 0;
function test(name, condition) {
  if (condition) {
    passed++;
    console.log('PASS:', name);
  } else {
    failed++;
    console.log('FAIL:', name);
  }
}

async function run() {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { aiEnabled: false, driveBackupEnabled: true, featTags: true, featSummary: true },
    [STORAGE_KEY]: [createBookmark({ url: 'https://a.com', title: 'A', tags: ['a'] })],
  });

  test('Auth availability is ready', getDriveAuthAvailability().available === true);

  const oldManifest = chrome.runtime.getManifest;
  chrome.runtime.getManifest = () => ({
    oauth2: {
      client_id: 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
      scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    },
  });
  test('Placeholder OAuth client is rejected', getDriveAuthAvailability().available === false);
  chrome.runtime.getManifest = oldManifest;

  const uploaded = await uploadDriveBackupJSON();
  test('Upload returns Drive file id', !!uploaded.id);

  const settingsAfterUpload = await getSettings();
  test('Upload stores success status', settingsAfterUpload.driveBackupLastResult === 'success');

  const listed = await listDriveBackups(10);
  test('List backups includes uploaded file', listed.length >= 1);
  const latest = await getLatestDriveBackupMeta();
  test('Latest backup available', !!latest && latest.id === listed[0].id);

  const mergePayload = {
    data: {
      bookmarks: [
        createBookmark({ url: 'https://a.com', title: 'A Duplicate', tags: ['dup'] }),
        createBookmark({ url: 'https://b.com', title: 'B New', tags: ['b'] }),
      ],
      settings: { aiEnabled: true, aiModel: 'restored-model' },
    },
  };
  const merged = await applyDriveRestorePayload(mergePayload, 'merge');
  const afterMergeBookmarks = await getBookmarks();
  const afterMergeSettings = await getSettings();
  test('Merge restore imports only missing URLs', merged.imported === 1 && merged.skipped === 1);
  test('Merge restore keeps local settings precedence', afterMergeSettings.aiEnabled === false);
  test('Merge restore keeps both local and new bookmarks', afterMergeBookmarks.length >= 2);

  const replacePayload = {
    data: {
      bookmarks: [createBookmark({ url: 'https://replace.com', title: 'Only', tags: ['one'] })],
      settings: { aiEnabled: true, aiModel: 'replace-model' },
    },
  };
  await applyDriveRestorePayload(replacePayload, 'replace');
  const afterReplaceBookmarks = await getBookmarks();
  const afterReplaceSettings = await getSettings();
  test('Replace restore overwrites bookmarks', afterReplaceBookmarks.length === 1 && afterReplaceBookmarks[0].url === 'https://replace.com');
  test('Replace restore applies backup settings', afterReplaceSettings.aiEnabled === true);

  driveFiles.push({
    id: 'manual-latest',
    name: 'bookmark-vault-backup-manual.json',
    modifiedTime: new Date(Date.now() + 1000).toISOString(),
    size: '1',
    payload: {
      data: {
        bookmarks: [createBookmark({ url: 'https://latest.com', title: 'Latest', tags: ['latest'] })],
        settings: { aiEnabled: true, aiModel: 'latest-model' },
      },
    },
  });

  const restored = await restoreLatestDriveBackup('replace');
  const afterLatestBookmarks = await getBookmarks();
  test('restoreLatestDriveBackup uses newest file', restored.latest.id === 'manual-latest');
  test('restoreLatestDriveBackup applies downloaded payload', afterLatestBookmarks[0].url === 'https://latest.com');

  console.log('\nSummary:', { passed, failed });
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
