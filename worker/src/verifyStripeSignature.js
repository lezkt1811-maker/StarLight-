/* Hand-rolled replacement for the `stripe` npm package's webhook signature check.
   Implements Stripe's documented scheme (https://docs.stripe.com/webhooks#verify-manually)
   using only the Web Crypto API, which every Cloudflare Worker has natively — no
   Node compatibility flags, no npm dependency, and it bundles to almost nothing.
   This is the ONLY thing we needed the stripe package for; everything else in this
   worker talks to Stripe/Anthropic/Resend over plain fetch(). */

export async function verifyStripeSignature(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
  if (!signatureHeader) throw new Error("Missing stripe-signature header");

  const parts = {};
  signatureHeader.split(",").forEach((kv) => {
    const idx = kv.indexOf("=");
    if (idx === -1) return;
    const key = kv.slice(0, idx).trim();
    const value = kv.slice(idx + 1).trim();
    if (key === "t") parts.t = value;
    if (key === "v1") parts.v1 = value; // ignore v0 (legacy) — only v1 (current scheme) is checked
  });

  if (!parts.t || !parts.v1) {
    throw new Error("Unable to extract timestamp and v1 signature from stripe-signature header");
  }

  const signedPayload = `${parts.t}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expectedHex = bufferToHex(sigBuffer);

  if (!timingSafeEqualHex(expectedHex, parts.v1)) {
    throw new Error("Signature mismatch — payload may have been tampered with, or the wrong signing secret is configured");
  }

  if (toleranceSeconds > 0) {
    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t));
    if (ageSeconds > toleranceSeconds) {
      throw new Error("Webhook timestamp is outside the allowed tolerance — possible replay");
    }
  }

  return JSON.parse(rawBody);
}

function bufferToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
