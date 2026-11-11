/**
 * Server-side reader for published website content.
 *
 * The marketing site must never go down because the API is down, so
 * every call here fails soft: on timeout, network error or a bad
 * status it returns null and the caller falls back to the copy
 * shipped in lib/ (see lib/getContent.js).
 *
 * Nothing here ever requests a draft. The public API has no parameter
 * that would return one, which is the actual guarantee — this module
 * simply has no way to ask.
 */

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:5000";

const TIMEOUT_MS = 4000;

/** How long a rendered page may be reused before it is regenerated. */
export const REVALIDATE_SECONDS = 60;

/**
 * Fetches a public endpoint, returning null rather than throwing.
 *
 * `tag` lets a publish invalidate exactly the pages that depend on
 * this data, instead of waiting out the revalidation window.
 */
async function getPublic(path, tag) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API_URL}/api/public${path}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      next: {
        revalidate: REVALIDATE_SECONDS,
        tags: ["site-content", tag].filter(Boolean),
      },
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      console.warn(
        `[content] API returned ${res.status} for ${path}; using built-in content`,
      );
      return null;
    }
    return await res.json();
  } catch (err) {
    // A build on a machine with no API running is normal and must not
    // fail, so this is a warning rather than an error.
    const reason =
      err?.name === "AbortError"
        ? `timed out after ${TIMEOUT_MS}ms`
        : err?.message;
    console.warn(
      `[content] API unreachable for ${path} (${reason}); using built-in content`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Everything the site needs, in one round trip. */
export function fetchPublishedSite() {
  return getPublic("/site", "site");
}

/** One published programme, or null when it is not published. */
export function fetchProgramme(slug) {
  return getPublic(
    `/programmes/${encodeURIComponent(slug)}`,
    `programme:${slug}`,
  );
}

/**
 * A draft page, for the admin portal's preview link.
 *
 * Requires a signed, short-lived token issued by the API to an
 * authenticated editor. Without a valid token the API returns 404,
 * exactly as it would for any unpublished content — so a preview URL
 * cannot be guessed, and this never caches.
 */
export async function fetchPreview(key, token, expires) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = new URL(
      `${API_URL}/api/public/pages/${encodeURIComponent(key)}/preview`,
    );
    url.searchParams.set("token", token);
    url.searchParams.set("expires", String(expires));

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
