import { fetchWithTimeout } from "./http.js";

const RESEND_TIMEOUT_MS = 30000;

export async function sendReadingEmail(env, { toEmail, customerName, pdfBytes, orderRef, productName, filename }) {
  const pdfBase64 = bytesToBase64(pdfBytes);
  const product = productName || "Lilith and Eve Astrology Detailed Reading";
  const attachmentName = filename || "Lilith-and-Eve-Astrology-Detailed-Reading.pdf";
  const resp = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL || "Lilith and Eve Astrology <readings@starchart13.com>",
      to: [toEmail],
      bcc: env.CONTACT_EMAIL ? [env.CONTACT_EMAIL] : undefined,
      subject: `Your ${product} (PDF attached)`,
      html:
        `<p>Hi ${escapeHtml(customerName || "there")},</p>` +
        `<p>Thank you for your ${escapeHtml(product)} purchase. Your personalized PDF is attached.</p>` +
        `<p style="color:#888;font-size:12px;">Order reference: ${escapeHtml(orderRef || "")}</p>` +
        `<p>✨ Lilith and Eve Astrology</p>`,
      attachments: [
        {
          filename: attachmentName,
          content: pdfBase64,
        },
      ],
    }),
  }, RESEND_TIMEOUT_MS);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resend API error ${resp.status}: ${text}`);
  }
}

/* Sent to the customer instead of a reading when the AI-written interpretation fails --
   never ship a PDF full of placeholder text. Keeps the customer informed (and bcc'd to
   the owner as a record) while the owner finishes the order manually. */
export async function sendHoldingEmail(env, { toEmail, customerName, orderRef, productName }) {
  const product = productName || "Lilith and Eve Astrology reading";
  const resp = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL || "Lilith and Eve Astrology <readings@starchart13.com>",
      to: [toEmail],
      bcc: env.CONTACT_EMAIL ? [env.CONTACT_EMAIL] : undefined,
      subject: `Your ${product} is being personally finished`,
      html:
        `<p>Hi ${escapeHtml(customerName || "there")},</p>` +
        `<p>Thank you for your ${escapeHtml(product)} purchase. Your chart data came through perfectly, but our ` +
        `automatic writing step hit a snag, so rather than send you an incomplete reading, we're finishing yours ` +
        `personally. You'll receive your complete PDF by email shortly.</p>` +
        `<p style="color:#888;font-size:12px;">Order reference: ${escapeHtml(orderRef || "")}</p>` +
        `<p>✨ Lilith and Eve Astrology</p>`,
    }),
  }, RESEND_TIMEOUT_MS);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resend API error ${resp.status}: ${text}`);
  }
}

/* Safety net: if anything upstream fails, the site owner gets emailed instead of the
   customer silently receiving nothing after paying $25. */
export async function notifyOwner(env, { orderRef, email, error }) {
  if (!env.CONTACT_EMAIL || !env.RESEND_API_KEY) {
    console.error("Cannot notify owner — CONTACT_EMAIL or RESEND_API_KEY missing", { orderRef, email, error });
    return;
  }
  try {
    await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.FROM_EMAIL || "Lilith and Eve Astrology <readings@starchart13.com>",
        to: [env.CONTACT_EMAIL],
        subject: `Lilith and Eve Astrology order needs manual fulfillment (${orderRef || "unknown order"})`,
        html:
          `<p>Automatic PDF delivery failed for a paid order.</p>` +
          `<p>Order: ${escapeHtml(orderRef || "unknown")}</p>` +
          `<p>Customer email: ${escapeHtml(email || "unknown")}</p>` +
          `<p>Error: ${escapeHtml(error || "unknown")}</p>` +
          `<p>Please follow up and send the customer their reading manually.</p>`,
      }),
    }, RESEND_TIMEOUT_MS);
  } catch (e) {
    console.error("Failed to notify owner of fulfillment failure", e.message);
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
