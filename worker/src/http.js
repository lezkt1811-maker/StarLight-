/* Shared outbound-fetch timeout wrapper. A real order sat stuck in "generating" twice
   in production: once because the Anthropic call had no timeout, and again after that
   was fixed, because the *next* call in the chain (the holding email / owner alert)
   didn't either -- any hang anywhere in the fulfillment pipeline freezes the order's
   status forever, since it only advances once the current await resolves. Every
   outbound call in this worker goes through here so a hang anywhere always eventually
   throws instead of stalling the whole order indefinitely. */
export async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request to ${new URL(url).hostname} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
