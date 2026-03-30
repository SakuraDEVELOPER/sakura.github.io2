export const SITE_ONLINE_CACHE_STORAGE_KEY = "sakura-site-online-cache-v1";
const SITE_ONLINE_CACHE_MAX_AGE_MS = 30_000;

type SiteOnlineCachePayload = {
  updatedAt: number;
  count: number | null;
  users: unknown[];
};

const isSiteOnlineCachePayload = (value: unknown): value is SiteOnlineCachePayload =>
  typeof value === "object" &&
  value !== null &&
  "updatedAt" in value &&
  typeof (value as { updatedAt?: unknown }).updatedAt === "number" &&
  "users" in value &&
  Array.isArray((value as { users?: unknown[] }).users);

function readSiteOnlineCachePayload(): SiteOnlineCachePayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawPayload = window.localStorage.getItem(SITE_ONLINE_CACHE_STORAGE_KEY);

    if (!rawPayload) {
      return null;
    }

    const parsedPayload = JSON.parse(rawPayload);

    if (!isSiteOnlineCachePayload(parsedPayload)) {
      window.localStorage.removeItem(SITE_ONLINE_CACHE_STORAGE_KEY);
      return null;
    }

    if (Date.now() - parsedPayload.updatedAt > SITE_ONLINE_CACHE_MAX_AGE_MS) {
      return null;
    }

    return parsedPayload;
  } catch {
    return null;
  }
}

function writeSiteOnlineCachePayload(payload: SiteOnlineCachePayload) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SITE_ONLINE_CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

export function readCachedSiteOnlineCount() {
  return readSiteOnlineCachePayload()?.count ?? null;
}

export function readCachedSiteOnlineUsers<T>() {
  const cachedPayload = readSiteOnlineCachePayload();
  return cachedPayload ? (cachedPayload.users as T[]) : [];
}

export function writeCachedSiteOnlineCount(count: number | null) {
  const currentPayload = readSiteOnlineCachePayload();

  writeSiteOnlineCachePayload({
    updatedAt: Date.now(),
    count,
    users: currentPayload?.users ?? [],
  });
}

export function writeCachedSiteOnlineUsers<T>(users: T[]) {
  writeSiteOnlineCachePayload({
    updatedAt: Date.now(),
    count: users.length,
    users,
  });
}
