export const PROFILE_COMMENTS_CACHE_KEY_PREFIX = "sakura-profile-comments-cache-v1:";

type CachedCommentShape = {
  id: string;
};

const isCachedCommentShape = (value: unknown): value is CachedCommentShape =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  typeof (value as { id?: unknown }).id === "string";

const getProfileCommentsCacheKey = (profileId: number) =>
  `${PROFILE_COMMENTS_CACHE_KEY_PREFIX}${profileId}`;

export function readCachedProfileComments<T extends CachedCommentShape>(
  profileId: number | null | undefined
): T[] {
  if (typeof window === "undefined" || typeof profileId !== "number" || profileId <= 0) {
    return [];
  }

  try {
    const rawComments = window.localStorage.getItem(getProfileCommentsCacheKey(profileId));

    if (!rawComments) {
      return [];
    }

    const parsedComments = JSON.parse(rawComments);

    if (!Array.isArray(parsedComments)) {
      window.localStorage.removeItem(getProfileCommentsCacheKey(profileId));
      return [];
    }

    return parsedComments.filter(isCachedCommentShape) as T[];
  } catch {
    return [];
  }
}

export function writeCachedProfileComments<T extends CachedCommentShape>(
  profileId: number | null | undefined,
  comments: T[]
) {
  if (typeof window === "undefined" || typeof profileId !== "number" || profileId <= 0) {
    return;
  }

  try {
    window.localStorage.setItem(
      getProfileCommentsCacheKey(profileId),
      JSON.stringify(comments)
    );
  } catch {}
}
