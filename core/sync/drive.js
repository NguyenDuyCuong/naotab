// drive.js — Google Drive backup/sync helpers (appDataFolder)
// Depends on: schema.js, storage.js

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_BACKUP_FILE_PREFIX = 'bookmark-vault-backup-';
const DRIVE_BACKUP_VERSION = 1;

function getDriveAuthAvailability() {
  const hasIdentity = !!(chrome && chrome.identity && chrome.identity.getAuthToken);
  if (!hasIdentity) {
    return {
      available: false,
      code: 'identity_unavailable',
      message: 'Chrome identity API is unavailable. Add "identity" permission in manifest.',
    };
  }

  const manifest = chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest() : {};
  const oauthClientId = manifest?.oauth2?.client_id || '';
  const scopes = Array.isArray(manifest?.oauth2?.scopes) ? manifest.oauth2.scopes : [];
  const isPlaceholderClientId = oauthClientId.includes('YOUR_GOOGLE_OAUTH_CLIENT_ID');
  if (!oauthClientId || isPlaceholderClientId) {
    return {
      available: false,
      code: 'oauth_client_missing',
      message: 'OAuth client ID is not configured. Set oauth2.client_id in manifest.json.',
    };
  }
  if (!scopes.includes(DRIVE_SCOPE)) {
    return {
      available: false,
      code: 'drive_scope_missing',
      message: `Missing Drive scope: ${DRIVE_SCOPE}`,
    };
  }

  return { available: true, code: 'ready', message: 'Google Drive backup is ready to authorize.' };
}

function identityGetAuthToken(options) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    try {
      const maybePromise = chrome.identity.getAuthToken(options, (token) => {
        const err = chrome.runtime && chrome.runtime.lastError ? chrome.runtime.lastError : null;
        if (err) return done(reject, new Error(err.message || 'Authorization failed'));
        if (!token) return done(reject, new Error('No OAuth token returned'));
        done(resolve, token);
      });
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(
          (token) => done(resolve, token),
          (e) => done(reject, e)
        );
      }
    } catch (e) {
      done(reject, e);
    }
  });
}

function identityRemoveCachedToken(token) {
  return new Promise((resolve) => {
    if (!token || !chrome.identity || !chrome.identity.removeCachedAuthToken) return resolve();
    try {
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    } catch (_) {
      resolve();
    }
  });
}

async function authorizeGoogleDrive(interactive = true) {
  const availability = getDriveAuthAvailability();
  if (!availability.available) {
    const err = new Error(availability.message);
    err.code = availability.code;
    throw err;
  }
  return identityGetAuthToken({ interactive: !!interactive });
}

async function getDriveBackupPayload() {
  const bookmarks = await getBookmarks();
  const settings = await getSettings();
  const manifest = chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest() : {};

  return {
    format: 'bookmark-vault-drive-backup',
    backupVersion: DRIVE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: manifest.version || '',
    schemaVersion: typeof SCHEMA_VERSION === 'number' ? SCHEMA_VERSION : null,
    data: {
      bookmarks,
      settings,
    },
  };
}

function createBackupFileName() {
  return `${DRIVE_BACKUP_FILE_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

async function updateDriveBackupState(patch) {
  const current = await getSettings();
  await saveSettings({ ...current, ...patch });
}

async function driveFetchWithAuth(url, init = {}, interactive = true, retry = true) {
  const token = await authorizeGoogleDrive(interactive);
  const headers = { ...(init.headers || {}), Authorization: `Bearer ${token}` };
  const response = await fetch(url, { ...init, headers });
  if (response.status === 401 && retry) {
    await identityRemoveCachedToken(token);
    return driveFetchWithAuth(url, init, interactive, false);
  }
  return response;
}

async function uploadDriveBackupJSON() {
  try {
    const payload = await getDriveBackupPayload();
    const boundary = 'bookmark-vault_drive_boundary_' + Date.now();
    const metadata = {
      name: createBackupFileName(),
      parents: ['appDataFolder'],
      mimeType: 'application/json',
    };

    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(payload),
      `--${boundary}--`,
    ].join('\r\n');

    const uploadUrl = `${DRIVE_UPLOAD_BASE}?uploadType=multipart&fields=id,name,modifiedTime,size`;
    const response = await driveFetchWithAuth(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }, true);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Drive upload failed (${response.status}): ${text || response.statusText}`);
    }

    const file = await response.json();
    await updateDriveBackupState({
      driveBackupLastAt: new Date().toISOString(),
      driveBackupLastResult: 'success',
      driveBackupLastError: '',
      driveBackupLastFileId: file.id || '',
    });
    return file;
  } catch (e) {
    await updateDriveBackupState({
      driveBackupLastResult: 'error',
      driveBackupLastError: e.message || 'Unknown Drive backup error',
    });
    throw e;
  }
}

async function listDriveBackups(limit = 10) {
  const q = `trashed = false and 'appDataFolder' in parents and name contains '${DRIVE_BACKUP_FILE_PREFIX}'`;
  const fields = 'files(id,name,modifiedTime,size)';
  const url = `${DRIVE_API_BASE}/files?spaces=appDataFolder&q=${encodeURIComponent(q)}&orderBy=modifiedTime desc&pageSize=${Math.max(1, limit)}&fields=${encodeURIComponent(fields)}`;

  const response = await driveFetchWithAuth(url, { method: 'GET' }, true);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to list Drive backups (${response.status}): ${text || response.statusText}`);
  }
  const data = await response.json();
  return data.files || [];
}

async function getLatestDriveBackupMeta() {
  const files = await listDriveBackups(1);
  return files[0] || null;
}

async function downloadDriveBackupJSON(fileId) {
  if (!fileId) throw new Error('Missing Drive file ID');
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`;
  const response = await driveFetchWithAuth(url, { method: 'GET' }, true);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to download Drive backup (${response.status}): ${text || response.statusText}`);
  }
  return response.json();
}

function normalizeDrivePayload(payload) {
  const data = payload && payload.data ? payload.data : payload || {};
  const bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];
  const settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  return { bookmarks, settings };
}

async function applyDriveRestorePayload(payload, strategy = 'merge') {
  const normalized = normalizeDrivePayload(payload);
  const currentSettings = await getSettings();
  let bookmarkResult;

  if (strategy === 'replace') {
    const total = await replaceAllBookmarks(normalized.bookmarks);
    bookmarkResult = { imported: total, skipped: 0, total };
  } else {
    bookmarkResult = await mergeBookmarks(normalized.bookmarks);
  }

  const mergedSettings = strategy === 'replace'
    ? { ...SETTINGS_DEFAULTS, ...normalized.settings }
    : { ...SETTINGS_DEFAULTS, ...normalized.settings, ...currentSettings };

  await saveSettings({
    ...mergedSettings,
    driveBackupLastRestoreAt: new Date().toISOString(),
    driveBackupLastResult: 'success',
    driveBackupLastError: '',
  });

  return bookmarkResult;
}

async function restoreLatestDriveBackup(strategy = 'merge') {
  const latest = await getLatestDriveBackupMeta();
  if (!latest) throw new Error('No backup files found in Google Drive appDataFolder');
  const payload = await downloadDriveBackupJSON(latest.id);
  const result = await applyDriveRestorePayload(payload, strategy);
  return { latest, payload, result };
}
