/* Sends a text message to the site owner's phone via Twilio. Separate from email.js's
   notifyOwner() because email gets missed -- this is the channel meant to actually be
   seen. Requires three secrets (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)
   plus the destination OWNER_PHONE var; silently no-ops (logging why) if any are missing,
   the same pattern notifyOwner() already uses for its own prerequisites. */
export async function smsOwner(env, message) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER || !env.OWNER_PHONE) {
    console.error("Cannot text owner — Twilio secrets or OWNER_PHONE missing");
    return;
  }
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
    const body = new URLSearchParams({
      To: env.OWNER_PHONE,
      From: env.TWILIO_FROM_NUMBER,
      // SMS segments are 160 chars; this isn't a hard cap, just keeps multi-segment cost sane.
      Body: String(message).slice(0, 480),
    });
    const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Twilio SMS failed (${resp.status}): ${text}`);
    }
  } catch (e) {
    console.error("Failed to text owner", e.message);
  }
}
