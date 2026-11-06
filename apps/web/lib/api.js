/**
 * Server-side reader for published website content.
 *
 * The marketing site must never go down because the API is down, so
 * every call here fails soft: on timeout, network error or a bad
 * status it returns null and the caller falls back to the static
 * content shipped in content.js.
 */

const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

const TIMEOUT_MS = 4000;

/** How long a rendered page may be reused before it is regenerated. */
export const REVALIDATE_SECONDS = 60;

export async function fetchPublishedSite() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API_URL}/api/public/site`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS, tags: ["site-content"] },
    });

    if (!res.ok) {
      console.warn(`[content] API returned ${res.status}; using built-in content`);
      return null;
    }
    return await res.json();
  } catch (err) {
    // A build on a machine with no API running is normal and must not
    // fail, so this is a warning rather than an error.
    const reason = err?.name === "AbortError" ? `timed out after ${TIMEOUT_MS}ms` : err?.message;
    console.warn(`[content] API unreachable (${reason}); using built-in content`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
