export async function sendReadingEmail(env, { toEmail, customerName, pdfBytes, orderRef }) {
  const pdfBase64 = bytesToBase64(pdfBytes);
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL || "StarChart13 <readings@starchart13.com>",
      to: [toEmail],
      bcc: env.CONTACT_EMAIL ? [env.CONTACT_EMAIL] : undefined,
      subject: "Your StarChart13 Detailed Reading (PDF attached)",
      html:
        `<p>Hi ${escapeHtml(customerName || "there")},</p>` +
        `<p>Thank you for your StarChart13 detailed reading purchase. Your personalized PDF is attached.</p>` +
        `<p style="color:#888;font-size:12px;">Order reference: ${escapeHtml(orderRef || "")}</p>` +
        `<p>✨ StarChart13</p>`,
      attachments: [
        {
          filename: "StarChart13-Detailed-Reading.pdf",
          content: pdfBase64,
        },
      ],
    }),
  });
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
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.FROM_EMAIL || "StarChart13 <readings@starchart13.com>",
        to: [env.CONTACT_EMAIL],
        subject: `StarChart13 order needs manual fulfillment (${orderRef || "unknown order"})`,
        html:
          `<p>Automatic PDF delivery failed for a paid order.</p>` +
          `<p>Order: ${escapeHtml(orderRef || "unknown")}</p>` +
          `<p>Customer email: ${escapeHtml(email || "unknown")}</p>` +
          `<p>Error: ${escapeHtml(error || "unknown")}</p>` +
          `<p>Please follow up and send the customer their reading manually.</p>`,
      }),
    });
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
