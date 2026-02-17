import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { platform } from 'os';
import { execSync } from 'child_process';
import { getRealHomeDir } from '../utils/path-utils.js';

const REQUEST_TIMEOUT_MS = 6000;

// Persistent cache for last successful window usage data.
// Survives across calls so that stale data is shown instead of nothing.
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let claudeUsageCache = { data: null, ts: 0 };
let codexUsageCache = { data: null, ts: 0 };

function withTimeout(signal, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

async function safeReadJson(path) {
  try {
    if (!existsSync(path)) return null;
    const text = await readFile(path, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function round1(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return Math.round(value * 10) / 10;
}

async function fetchJson(url, headers, signal) {
  const { signal: timeoutSignal, cleanup } = withTimeout(signal);
  try {
    const resp = await fetch(url, { method: 'GET', headers, signal: timeoutSignal });
    if (!resp.ok) {
      console.warn(`[usage-window] API returned ${resp.status} for ${url}`);
      return null;
    }
    const data = await resp.json().catch(() => null);
    return data && typeof data === 'object' ? data : null;
  } catch (err) {
    if (err?.name === 'AbortError') {
      console.warn(`[usage-window] Request timed out for ${url}`);
    } else {
      console.warn(`[usage-window] Fetch failed for ${url}: ${err?.message || err}`);
    }
    return null;
  } finally {
    cleanup();
  }
}

/**
 * Read credentials from macOS Keychain (mirrors api-config.js logic).
 */
function readMacKeychainCredentials() {
  if (platform() !== 'darwin') return null;
  const serviceNames = ['Claude Code-credentials', 'Claude Code'];
  for (const serviceName of serviceNames) {
    try {
      const result = execSync(
        `security find-generic-password -s "${serviceName}" -w 2>/dev/null`,
        { encoding: 'utf8', timeout: 5000 }
      );
      if (result && result.trim()) {
        return JSON.parse(result.trim());
      }
    } catch {
      // continue
    }
  }
  return null;
}

async function getClaudeAccessToken() {
  const home = getRealHomeDir();
  const candidates = [
    join(home, '.claude', '.credentials.json'),
    join(home, '.claude', 'credentials.json'),
    join(home, '.config', 'claude', 'credentials.json'),
  ];

  // File-based credentials
  for (const p of candidates) {
    const data = await safeReadJson(p);
    if (!data) continue;
    if (data.claudeAiOauth?.accessToken) return data.claudeAiOauth.accessToken;
    if (data.accessToken) return data.accessToken;
  }

  // macOS Keychain fallback
  if (platform() === 'darwin') {
    try {
      const keychainData = readMacKeychainCredentials();
      if (keychainData?.claudeAiOauth?.accessToken) {
        return keychainData.claudeAiOauth.accessToken;
      }
      if (keychainData?.accessToken) {
        return keychainData.accessToken;
      }
    } catch {
      // ignore
    }
  }

  console.warn('[usage-window] No Claude OAuth token found in any credential source');
  return null;
}

function getCachedResult(cache) {
  if (cache.data && (Date.now() - cache.ts) < CACHE_TTL_MS) {
    return cache.data;
  }
  return null;
}

export async function fetchClaudeWindowUsage(signal) {
  const token = await getClaudeAccessToken();
  if (!token) {
    return getCachedResult(claudeUsageCache);
  }

  const data = await fetchJson(
    'https://api.anthropic.com/api/oauth/usage',
    {
      Authorization: `Bearer ${token}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'Content-Type': 'application/json',
    },
    signal
  );
  if (!data) {
    return getCachedResult(claudeUsageCache);
  }

  const fiveHour = data.five_hour && typeof data.five_hour === 'object' ? data.five_hour : null;
  const sevenDay = data.seven_day && typeof data.seven_day === 'object' ? data.seven_day : null;

  const last5hPercent = round1(fiveHour?.utilization);
  const currentWeekPercent = round1(sevenDay?.utilization);

  if (last5hPercent === undefined && currentWeekPercent === undefined) {
    console.warn('[usage-window] API response missing utilization fields:', JSON.stringify(data).substring(0, 200));
    return getCachedResult(claudeUsageCache);
  }

  const result = {
    source: 'anthropic_oauth_usage',
    currentSessionPercent: last5hPercent,
    last5hPercent,
    currentWeekPercent,
    last5hResetsAt: typeof fiveHour?.resets_at === 'string' ? fiveHour.resets_at : undefined,
    currentWeekResetsAt: typeof sevenDay?.resets_at === 'string' ? sevenDay.resets_at : undefined,
  };

  // Update cache on success
  claudeUsageCache = { data: result, ts: Date.now() };
  return result;
}

async function getCodexAuth() {
  const home = getRealHomeDir();
  const candidates = [
    join(home, '.codex', 'auth.json'),
    join(home, '.config', 'codex', 'auth.json'),
  ];
  for (const p of candidates) {
    const data = await safeReadJson(p);
    if (!data) continue;
    const token = data.tokens?.access_token;
    const accountId = data.tokens?.account_id;
    if (token && accountId) return { token, accountId };
  }
  return null;
}

export async function fetchCodexWindowUsage(signal) {
  const auth = await getCodexAuth();
  if (!auth) {
    return getCachedResult(codexUsageCache);
  }

  const data = await fetchJson(
    'https://chatgpt.com/backend-api/wham/usage',
    {
      Authorization: `Bearer ${auth.token}`,
      'chatgpt-account-id': auth.accountId,
      'User-Agent': 'codex-cli',
      'Content-Type': 'application/json',
    },
    signal
  );
  if (!data) {
    return getCachedResult(codexUsageCache);
  }

  const rl = data.rate_limit && typeof data.rate_limit === 'object' ? data.rate_limit : null;
  const primary = rl?.primary_window && typeof rl.primary_window === 'object' ? rl.primary_window : null;
  const secondary = rl?.secondary_window && typeof rl.secondary_window === 'object' ? rl.secondary_window : null;

  const last5hPercent = round1(primary?.used_percent);
  const currentWeekPercent = round1(secondary?.used_percent);
  if (last5hPercent === undefined && currentWeekPercent === undefined) {
    return getCachedResult(codexUsageCache);
  }

  const result = {
    source: 'chatgpt_wham_usage',
    currentSessionPercent: last5hPercent,
    last5hPercent,
    currentWeekPercent,
    last5hResetAfterSeconds: typeof primary?.reset_after_seconds === 'number' ? primary.reset_after_seconds : undefined,
    currentWeekResetAfterSeconds: typeof secondary?.reset_after_seconds === 'number' ? secondary.reset_after_seconds : undefined,
    planType: typeof data.plan_type === 'string' ? data.plan_type : undefined,
  };

  codexUsageCache = { data: result, ts: Date.now() };
  return result;
}
