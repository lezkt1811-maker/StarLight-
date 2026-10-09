import { buildReadingPdf, buildMiniReadingPdf } from "./pdf.js";
import { generateInterpretation, generateMiniInterpretation } from "./interpret.js";
import { sendReadingEmail, sendHoldingEmail, notifyOwner } from "./email.js";
import { smsOwner } from "./sms.js";
import { resolveBrand, applyBrand } from "./brand.js";

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
async function alertOwner(env, { orderRef, email, error, brand }) {
  await Promise.allSettled([
    notifyOwner(env, { orderRef, email, error, brand }),
    smsOwner(env, `${(brand && brand.name) || "Star Chart 13"}: order ${orderRef || "?"} needs manual fulfillment. ${error || ""}`),
  ]);
}

/* ALLOWED_ORIGIN may list several storefronts, comma-separated. The browser only
   accepts a single origin in the response header, so echo the caller's origin back
   when it is on the list (and fall back to the first entry otherwise). */
let requestOrigin = "";
function corsHeaders(env) {
  const allowed = String(env.ALLOWED_ORIGIN || "*").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = allowed.includes("*") ? "*" : (allowed.includes(requestOrigin) ? requestOrigin : allowed[0]);
  return {
    "Vary": "Origin",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    requestOrigin = request.headers.get("Origin") || "";

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
  const brand = resolveBrand(order.payload);

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
        brand,
      });
      await alertOwner(env, {
        brand,
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
      filename: isMini ? brand.miniPdfFilename : brand.pdfFilename,
      brand,
    });

    await setStatus(env, order, STATUS.FULFILLED, { lastError: null });
  } catch (err) {
    console.error("Order fulfillment failed", order.orderId, stripeSessionId, err.message);
    await setStatus(env, order, STATUS.FAILED, { lastError: err.message });
    await alertOwner(env, { orderRef: stripeSessionId, email, error: err.message, brand });
  }
}
