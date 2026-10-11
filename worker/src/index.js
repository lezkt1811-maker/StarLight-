import { buildReadingPdf, buildMiniReadingPdf } from "./pdf.js";
import { generateInterpretation, generateMiniInterpretation } from "./interpret.js";
import { sendReadingEmail, sendHoldingEmail, notifyOwner } from "./email.js";
import { smsOwner } from "./sms.js";

const VALID_SCHEMAS = ["starchart13-detailed-reading", "starchart13-mini-reading"];
import { STATUS, createOrder, getOrder, getOrderIdBySession, setStatus } from "./orders.js";
import { verifyStripeSignature } from "./verifyStripeSignature.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// An order stuck in "generating" with no error, forever, turned out to be Cloudflare
// itself: a Worker's ctx.waitUntil() only gets ~30 seconds of extra runtime after its
// HTTP response has already been sent, and gets silently cancelled past that -- before
// our own retry/timeout/error-handling code ever gets a chance to run. The AI writing +
// PDF + email chain routinely needs longer than that. So the webhook no longer does any
// of that slow work itself: it just marks the order PAID and returns. A Cron Trigger
// (below) picks up PAID orders on its own schedule, where there's no prior response to
// extend past, so the full chain gets to run to completion.
// Must comfortably exceed the worst-case time a single order can legitimately spend
// in GENERATING: up to two Anthropic attempts at 170s each (interpret.js) plus a
// short sleep between them, then PDF + email. Too short here would make the sweep
// re-pick (and reprocess) an order that's still mid-attempt, not actually abandoned.
const STALE_GENERATING_MS = 10 * 60 * 1000;

/* Alerts the owner on every channel we have -- email (easy to miss) and a text
   (the one actually meant to be seen). Both are best-effort; neither throws. */
async function alertOwner(env, { orderRef, email, error }) {
  await Promise.allSettled([
    notifyOwner(env, { orderRef, email, error }),
    smsOwner(env, `Star Chart 13: order ${orderRef || "?"} needs manual fulfillment. ${error || ""}`),
  ]);
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (url.pathname === "/prepare" && request.method === "POST") {
      return handlePrepare(request, env);
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      return handleWebhook(request, env, ctx);
    }

    if (url.pathname === "/status" && request.method === "GET") {
      return handleStatus(url, env);
    }

    if (url.pathname === "/admin/resend" && (request.method === "POST" || request.method === "GET")) {
      return handleAdminResend(request, url, env);
    }

    if (url.pathname === "/admin/log" && request.method === "GET") {
      return handleAdminLog(url, env);
    }

    if (url.pathname === "/admin/pdf" && request.method === "GET") {
      return handleAdminPdf(url, env);
    }

    return new Response("Not found", { status: 404 });
  },

  // Runs on its own schedule (see wrangler.toml's [triggers]), independent of any HTTP
  // request/response -- so it isn't subject to the waitUntil 30-second-after-response
  // cutoff that was silently killing orders. This is where the actual AI writing, PDF
  // rendering and emailing happens.
  async scheduled(event, env, ctx) {
    await sweepOrders(env);
  },
};

/* Called by the browser right before it opens the Stripe Payment Link. Stores the
   already-computed chart data (the browser did the astronomy math — this worker
   never recalculates it) under a short-lived order id, which we pass to Stripe as
   client_reference_id so the webhook can find it again after payment. A Payment
   Link URL can't carry the full chart JSON directly, and we never want birth data
   sitting in a URL or a Stripe field anyway. */
async function handlePrepare(request, env) {
  const headers = { ...corsHeaders(env), "Content-Type": "application/json" };
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }
  if (!payload || !VALID_SCHEMAS.includes(payload.schema) || !Array.isArray(payload.points) || !payload.points.length) {
    return new Response(JSON.stringify({ error: "Unrecognized or empty report payload — generate your chart first." }), { status: 400, headers });
  }

  const orderId = crypto.randomUUID();
  await createOrder(env, orderId, payload);
  return new Response(JSON.stringify({ orderId }), { status: 200, headers });
}

/* A lightweight, privacy-safe status check the success page can poll using only the
   Stripe Checkout Session ID (which Stripe substitutes into the redirect URL) — it
   never returns birth data or the chart payload, only the fulfillment status. */
async function handleStatus(url, env) {
  const headers = { ...corsHeaders(env), "Content-Type": "application/json" };
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "session_id is required" }), { status: 400, headers });
  }
  const orderId = await getOrderIdBySession(env, sessionId);
  if (!orderId) {
    return new Response(JSON.stringify({ status: "pending" }), { status: 200, headers });
  }
  const order = await getOrder(env, orderId);
  if (!order) {
    return new Response(JSON.stringify({ status: "pending" }), { status: 200, headers });
  }
  return new Response(
    JSON.stringify({ status: order.status, updatedAt: order.updatedAt, schema: order.payload?.schema || null }),
    { status: 200, headers }
  );
}

/* One-off recovery path: re-mark a terminal order PAID so the next scheduled() sweep
   regenerates and re-sends it through the current (fixed) pipeline -- for making right
   on orders that were fulfilled with placeholder AI text before that bug was fixed.
   Requires a timing-safe-compared bearer token (env.ADMIN_TOKEN) since it can force
   reprocessing of any order by id, and refuses anything not already in a terminal
   state so it can never interrupt an order mid-flight. GET (with ?orderId=&token=) is
   accepted alongside POST so this can be triggered by tapping a link, not just curl. */
async function handleAdminResend(request, url, env) {
  const headers = { "Content-Type": "application/json" };

  let orderId, token;
  if (request.method === "GET") {
    orderId = url.searchParams.get("orderId");
    token = url.searchParams.get("token") || "";
  } else {
    token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
    }
    orderId = body?.orderId;
  }

  if (!env.ADMIN_TOKEN || !timingSafeEqual(token, env.ADMIN_TOKEN)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }
  if (!orderId) {
    return new Response(JSON.stringify({ error: "orderId is required" }), { status: 400, headers });
  }

  const order = await getOrder(env, orderId);
  if (!order) {
    return new Response(JSON.stringify({ error: `No order found for id ${orderId}` }), { status: 404, headers });
  }
  if (order.status !== STATUS.FULFILLED && order.status !== STATUS.FAILED) {
    return new Response(
      JSON.stringify({ error: `Order is in status "${order.status}", not a terminal state -- refusing to touch an order that may still be in flight.` }),
      { status: 409, headers }
    );
  }

  const previousStatus = order.status;
  await setStatus(env, order, STATUS.PAID, { lastError: null });
  return new Response(JSON.stringify({ ok: true, orderId, previousStatus }), { status: 200, headers });
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

/* A simple, read-only business log: every order, newest first, with the customer's
   info, birth details, and -- for anything fulfilled since this was added -- the
   actual written reading, right there to review. Same bearer-token model as
   /admin/resend, just GET-only and side-effect-free. Orders fulfilled before this
   endpoint existed won't have a saved "interpretation" (that text was never kept
   anywhere before now), so those rows say so instead of showing blank content. */
async function handleAdminLog(url, env) {
  const token = url.searchParams.get("token") || "";
  if (!env.ADMIN_TOKEN || !timingSafeEqual(token, env.ADMIN_TOKEN)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const orders = [];
  let cursor;
  while (true) {
    const page = await env.ORDERS.list({ prefix: "order:", cursor });
    for (const key of page.keys) {
      const raw = await env.ORDERS.get(key.name);
      if (raw) orders.push(JSON.parse(raw));
    }
    if (page.list_complete) break;
    cursor = page.cursor;
  }
  orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  // Your own checkout tests (same email as CONTACT_EMAIL, the owner alert address)
  // are hidden by default so the list reads as real customers only. Nothing is
  // deleted -- ?all=1 shows everything, test orders included.
  const showAll = url.searchParams.get("all") === "1";
  const ownEmail = (env.CONTACT_EMAIL || "").toLowerCase();
  const hiddenCount = ownEmail ? orders.filter((o) => (o.customerEmail || "").toLowerCase() === ownEmail).length : 0;
  const visibleOrders = showAll || !ownEmail ? orders : orders.filter((o) => (o.customerEmail || "").toLowerCase() !== ownEmail);

  return new Response(renderAdminLogHtml(visibleOrders, token, { showAll, hiddenCount, hasOwnEmail: !!ownEmail }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/* Rebuilds a PDF on demand from an order's stored payload + saved interpretation --
   the exact same builder functions used for the real email, so the content matches
   what the customer received. Only works for orders fulfilled after the reading-log
   feature shipped (that's the first point "interpretation" started being saved). */
async function handleAdminPdf(url, env) {
  if (!env.ADMIN_TOKEN || !timingSafeEqual(url.searchParams.get("token") || "", env.ADMIN_TOKEN)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const orderId = url.searchParams.get("orderId");
  if (!orderId) return new Response("orderId is required", { status: 400 });

  const order = await getOrder(env, orderId);
  if (!order) return new Response(`No order found for id ${orderId}`, { status: 404 });
  if (!order.interpretation) {
    return new Response(
      "This order has no saved reading text to rebuild a PDF from -- it was fulfilled before the reading log started saving that, or it isn't fulfilled yet.",
      { status: 404 }
    );
  }

  const isMini = order.payload?.schema === "starchart13-mini-reading";
  const pdfBytes = isMini
    ? await buildMiniReadingPdf(order.payload, order.interpretation)
    : await buildReadingPdf(order.payload, order.interpretation);
  const filename = isMini ? "Lilith-and-Eve-Placement-Reading.pdf" : "Lilith-and-Eve-Astrology-Detailed-Reading.pdf";

  return new Response(pdfBytes, {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"` },
  });
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderAdminLogHtml(orders, token, viewState = {}) {
  const { showAll = false, hiddenCount = 0, hasOwnEmail = false } = viewState;
  const rows = orders.map((o) => {
    const c = o.payload?.customer || {};
    const attr = o.payload?.attribution || {};
    const isMini = o.payload?.schema === "starchart13-mini-reading";
    const product = isMini ? "Mini Reading ($7)" : "Full Reading ($25)";
    const birth = [c.birthDate, c.birthTime24h, c.birthLocation].filter(Boolean).join(" · ");

    const source = attr.adClickPlatform
      || [attr.utmSource, attr.utmMedium].filter(Boolean).join(" / ")
      || (attr.referrer ? (() => { try { return new URL(attr.referrer).hostname; } catch (e) { return attr.referrer; } })() : null)
      || "Direct / unknown";
    const sourceDetail = [attr.utmCampaign ? `campaign: ${attr.utmCampaign}` : null, attr.landingPage ? `landed on: ${attr.landingPage}` : null]
      .filter(Boolean).join(" · ");

    const wheelImg = o.payload?.wheelImagePNG
      ? `<div class="sec"><div class="sec-label">Chart Image</div><img class="wheel-thumb" src="${escapeHtml(o.payload.wheelImagePNG)}" alt="Natal wheel"/></div>`
      : "";

    const points = Array.isArray(o.payload?.points) && o.payload.points.length
      ? `<div class="sec"><div class="sec-label">Placements</div><table class="pts"><tr><th>Point</th><th>True-Sky</th><th>House</th><th>Tropical</th></tr>${o.payload.points.map((p) =>
          `<tr><td>${escapeHtml(p.name)}${p.retrograde ? " R" : ""}</td><td>${escapeHtml(p.trueSky?.constellation)} ${Math.floor(p.trueSky?.degree || 0)}°</td><td>${escapeHtml(p.house)}</td><td>${escapeHtml(p.tropical?.sign)} ${Math.floor(p.tropical?.degree || 0)}°</td></tr>`
        ).join("")}</table></div>`
      : "";

    const sections = o.interpretation
      ? Object.entries(o.interpretation)
          .map(
            ([k, v]) =>
              `<div class="sec"><div class="sec-label">${escapeHtml(k)}</div><div class="sec-text">${escapeHtml(v)}</div></div>`
          )
          .join("")
      : `<div class="sec-text" style="opacity:.6;">No saved reading text for this order (sent before this log existed, or not yet fulfilled).</div>`;

    const pdfLink = o.interpretation
      ? `<a class="pdf-link" href="/admin/pdf?orderId=${encodeURIComponent(o.orderId)}&token=${encodeURIComponent(token)}" target="_blank" rel="noopener">View/Download PDF</a>`
      : "";

    return `<details class="order">
  <summary>
    <span class="od">${escapeHtml((o.createdAt || "").slice(0, 10))}</span>
    <span class="on">${escapeHtml(c.name || "(no name)")}</span>
    <span class="oe">${escapeHtml(o.customerEmail || "")}</span>
    <span class="op">${product}</span>
    <span class="os status-${escapeHtml(o.status)}">${escapeHtml(o.status)}</span>
  </summary>
  <div class="order-body">
    <div class="meta">Order ${escapeHtml(o.orderId)} &middot; Birth: ${escapeHtml(birth) || "—"} &middot; Attempts: ${o.attempts || 0}${o.lastError ? ` &middot; Last error: ${escapeHtml(o.lastError)}` : ""}</div>
    <div class="sec"><div class="sec-label">Came From</div><div class="sec-text">${escapeHtml(source)}${sourceDetail ? `<br><span style="opacity:.6;font-size:11px;">${escapeHtml(sourceDetail)}</span>` : ""}</div></div>
    ${pdfLink}
    ${wheelImg}
    ${points}
    ${sections}
  </div>
</details>`;
  }).join("\n");

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex, nofollow"/><title>Reading Log | Star Chart 13</title>
<style>
body{background:#0a0614;color:#e0ecff;font-family:system-ui,-apple-system,sans-serif;margin:0;padding:16px;}
h1{font-size:18px;margin:0 0 4px;}
.count{opacity:.6;font-size:12px;margin-bottom:16px;}
.order{border:1px solid rgba(99,102,241,.3);border-radius:10px;margin-bottom:8px;background:rgba(99,102,241,.04);}
.order summary{padding:10px 12px;cursor:pointer;display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px;list-style:none;}
.order summary::-webkit-details-marker{display:none;}
.od{opacity:.6;font-family:monospace;}
.on{font-weight:700;}
.oe{opacity:.75;word-break:break-all;}
.op{color:#22D3EE;}
.os{margin-left:auto;font-size:11px;text-transform:uppercase;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.08);}
.status-fulfilled{color:#8dffb0;}
.status-failed{color:#ff8f8f;}
.order-body{padding:0 12px 14px;border-top:1px solid rgba(99,102,241,.2);}
.meta{font-size:11px;opacity:.6;margin:10px 0;font-family:monospace;word-break:break-all;}
.sec{margin-bottom:10px;}
.sec-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#B026FF;margin-bottom:3px;}
.sec-text{font-size:13px;line-height:1.6;white-space:pre-wrap;}
.wheel-thumb{max-width:260px;width:100%;border-radius:8px;border:1px solid rgba(99,102,241,.3);display:block;}
.pts{width:100%;border-collapse:collapse;font-size:12px;}
.pts th{text-align:left;color:#22D3EE;font-weight:700;padding:3px 6px;border-bottom:1px solid rgba(99,102,241,.3);}
.pts td{padding:3px 6px;border-bottom:1px solid rgba(99,102,241,.1);}
.pdf-link{display:inline-block;margin:4px 0 10px;padding:8px 14px;border-radius:8px;border:1px solid rgba(34,211,238,.5);color:#22D3EE;text-decoration:none;font-size:12px;font-weight:700;}
.toggle{font-size:12px;opacity:.75;}
.toggle a{color:#22D3EE;}
</style></head><body>
<h1>Reading Log</h1>
<div class="count">${orders.length} order${orders.length === 1 ? "" : "s"} &middot; most recent first</div>
${hasOwnEmail ? `<div class="toggle">${
  showAll
    ? `Showing everything, including your own test orders. <a href="/admin/log?token=${encodeURIComponent(token)}">Hide my test orders</a>`
    : `${hiddenCount} of your own test order${hiddenCount === 1 ? "" : "s"} hidden. <a href="/admin/log?token=${encodeURIComponent(token)}&all=1">Show everything</a>`
}</div>` : ""}
${rows || "<p>No orders yet.</p>"}
</body></html>`;
}

async function handleWebhook(request, env, ctx) {
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event;
  try {
    event = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe signature verification failed", err.message);
    return new Response("Signature verification failed", { status: 400 });
  }

  // Only a completed Checkout Session with payment actually collected triggers fulfillment.
  // (Delayed-notification methods report success via this same event once payment clears,
  // so checking payment_status here also covers "async payment succeeded" cases.)
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status === "paid") {
      // Just mark the order PAID (a couple of fast KV writes) and acknowledge the webhook.
      // The slow work (AI writing, PDF, email) happens on the next scheduled() sweep, not
      // here -- see the comment on STALE_GENERATING_MS above for why.
      ctx.waitUntil(markPaid(env, session));
    } else {
      console.log("checkout.session.completed received but not yet paid", session.id, session.payment_status);
    }
  }

  return new Response("ok", { status: 200 });
}

async function markPaid(env, session) {
  const orderId = session.client_reference_id;
  const email = session.customer_details?.email || session.customer_email;
  const stripeSessionId = session.id;

  if (!orderId) {
    console.error("Checkout session had no client_reference_id", stripeSessionId);
    await alertOwner(env, { orderRef: stripeSessionId, email, error: "Checkout session had no client_reference_id — cannot locate chart data." });
    return;
  }

  const order = await getOrder(env, orderId);
  if (!order) {
    console.error("No stored order found for orderId", orderId, stripeSessionId);
    await alertOwner(env, { orderRef: stripeSessionId, email, error: `No stored order found for order id ${orderId}.` });
    return;
  }

  // Idempotency: Stripe retries webhooks it didn't get a fast 2xx for, and can also send
  // the same logical event more than once. Only a PREPARED or already-PAID order (e.g. a
  // retried delivery of the same event) should be (re)marked here -- anything further
  // along is already being swept or finished.
  if (order.status !== STATUS.PREPARED && order.status !== STATUS.PAID) {
    console.log("Order already past PAID — skipping duplicate webhook", orderId, stripeSessionId);
    return;
  }

  if (!email) {
    console.error("Checkout session had no customer email", orderId, stripeSessionId);
    await setStatus(env, order, STATUS.FAILED, { lastError: "Checkout session had no customer email", stripeSessionId });
    await alertOwner(env, { orderRef: stripeSessionId, email, error: "Checkout session had no customer email" });
    return;
  }

  await setStatus(env, order, STATUS.PAID, { stripeSessionId, customerEmail: email });
}

/* Scans every stored order for ones ready to process: newly PAID orders, plus any order
   abandoned mid-"generating" (a crashed or evicted previous sweep) once it's been stuck
   long enough that it's clearly not still in flight. Runs every minute (wrangler.toml). */
async function sweepOrders(env) {
  const dueOrders = [];
  let cursor;
  while (true) {
    const page = await env.ORDERS.list({ prefix: "order:", cursor });
    for (const key of page.keys) {
      const raw = await env.ORDERS.get(key.name);
      if (!raw) continue;
      const order = JSON.parse(raw);
      const stale = order.status === STATUS.GENERATING && Date.now() - new Date(order.updatedAt).getTime() > STALE_GENERATING_MS;
      if (order.status === STATUS.PAID || stale) dueOrders.push(order);
    }
    if (page.list_complete) break;
    cursor = page.cursor;
  }

  for (const order of dueOrders) {
    await processOrder(env, order);
  }
}

async function processOrder(env, order) {
  const stripeSessionId = order.stripeSessionId;
  const email = order.customerEmail;
  const isMini = order.payload.schema === "starchart13-mini-reading";

  try {
    order = await setStatus(env, order, STATUS.GENERATING, { attempts: order.attempts + 1 });

    let interpretation = null;
    let interpretationError = null;
    // One retry covers a transient blip (rate limit, brief outage); a persistent
    // problem will still fail both attempts.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        interpretation = isMini
          ? await generateMiniInterpretation(env, order.payload)
          : await generateInterpretation(env, order.payload);
        interpretationError = null;
        break;
      } catch (err) {
        interpretationError = err;
        console.error(`AI interpretation attempt ${attempt} failed:`, err.message);
        if (attempt < 2) await sleep(1500);
      }
    }

    if (!interpretation) {
      // Never ship a PDF full of placeholder text — hold the order instead. The customer
      // gets a holding email saying their reading is being finished personally (not
      // silence, not a broken PDF), and the owner gets alerted on every channel
      // available so this gets caught and fixed instead of discovered by a customer.
      console.error("AI interpretation failed twice — holding order instead of sending placeholder PDF:", interpretationError?.message);
      await sendHoldingEmail(env, {
        toEmail: email,
        customerName: order.payload.customer?.name,
        orderRef: stripeSessionId,
        productName: order.payload.product?.name,
      });
      await alertOwner(env, {
        orderRef: stripeSessionId,
        email,
        error: `AI interpretation failed twice — reading HELD, customer was sent a holding email instead of a PDF. Underlying error: ${interpretationError?.message}`,
      });
      await setStatus(env, order, STATUS.FAILED, { lastError: `AI interpretation failed: ${interpretationError?.message}` });
      return;
    }

    const pdfBytes = isMini
      ? await buildMiniReadingPdf(order.payload, interpretation)
      : await buildReadingPdf(order.payload, interpretation);
    order = await setStatus(env, order, STATUS.GENERATED);

    order = await setStatus(env, order, STATUS.EMAILING);
    await sendReadingEmail(env, {
      toEmail: email,
      customerName: order.payload.customer?.name,
      pdfBytes,
      orderRef: stripeSessionId,
      productName: order.payload.product?.name,
      filename: isMini ? "Lilith-and-Eve-Placement-Reading.pdf" : "Lilith-and-Eve-Astrology-Detailed-Reading.pdf",
    });

    // Save the actual written reading onto the order record -- this is the only place
    // that text ever existed outside the one-time email, so without this a completed
    // order's "results" would be unrecoverable the moment it was sent.
    await setStatus(env, order, STATUS.FULFILLED, { lastError: null, interpretation });
  } catch (err) {
    console.error("Order fulfillment failed", order.orderId, stripeSessionId, err.message);
    await setStatus(env, order, STATUS.FAILED, { lastError: err.message });
    await alertOwner(env, { orderRef: stripeSessionId, email, error: err.message });
  }
}
