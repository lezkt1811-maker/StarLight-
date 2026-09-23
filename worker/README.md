# StarChart13 fulfillment worker

Handles what the static site can't: after someone pays for the $25 detailed
reading on [buy.stripe.com/bJedRb8Yk78ycSsgWOgjC00](https://buy.stripe.com/bJedRb8Yk78ycSsgWOgjC00),
this Cloudflare Worker verifies the payment, asks Claude to write the
personalized interpretation, renders the PDF, and emails it to the customer.
If anything in that chain fails, it emails **you** instead so the order can
be fulfilled by hand rather than the customer getting nothing.

## How it fits together

1. Browser generates the free chart (this is the only place the chart is ever
   calculated — nothing on the backend recomputes it). Clicking "PREPARE MY
   DETAILED READING" then `POST /prepare`s that exact chart JSON. The worker
   stores it in KV as an order record (`status: "prepared"`, 30-day TTL under
   a random order id) and returns that id.
2. Browser opens the Stripe Payment Link with `?client_reference_id=<order id>`
   appended — never the birth data or chart itself — so Stripe carries the id
   through checkout and the customer can close the browser at any point after.
3. Stripe sends a `checkout.session.completed` webhook to `POST /webhook`.
4. The worker verifies Stripe's signature, confirms `payment_status === "paid"`,
   looks up the stored order by `client_reference_id`, calls Claude to write the
   reading (from derived chart *facts* only — see `src/facts.js` — it can never
   alter a placement), builds the PDF with `pdf-lib`, and emails it via Resend
   to the address Stripe collected at checkout. The order's `status` field is
   updated at each step (`paid` → `generating` → `generated` → `emailing` →
   `fulfilled`), and a `GET /status?session_id=...` endpoint lets the success
   page show live progress without exposing any chart/birth data.
5. **Idempotent by design:** Stripe can and does retry webhooks. A retry for an
   already-`fulfilled` order (matched by order id *and* Stripe session id) is
   detected and silently ignored — no second email, no false failure alert.
6. On any real failure (missing payload, Claude down, Resend down, etc.) the
   order is marked `failed` with the error recorded, and it emails
   `CONTACT_EMAIL` with the order id and the error so you can follow up — a
   $25 order should never just silently disappear.
7. **Retrying a failed order:** once whatever was down (Resend, Claude, etc.)
   is back, go to Stripe Dashboard → Developers → Webhooks → your endpoint →
   find the `checkout.session.completed` event for that order → **Resend**.
   Because fulfillment is keyed off the order's status (not "has this Stripe
   event been seen before"), a `failed` order safely retries and completes —
   the customer is never charged again.

## One-time setup — GitHub Actions deploys this automatically

`.github/workflows/deploy-worker.yml` deploys this worker to Cloudflare on
every push to `worker/**` — no terminal, no Cloudflare "Connect to Git" flow.
It runs on GitHub's servers using the `wrangler` CLI (already a dependency
here). Setup is: get two non-secret values into `wrangler.toml`, and put five
secrets into the GitHub repo's own secret store — never into a file.

You'll need accounts (all have free tiers that cover this): **Cloudflare**,
**Resend**, and an **Anthropic** API key. You already have Stripe.

1. **Cloudflare Account ID** — on the Cloudflare dashboard's Workers & Pages
   overview page, it's shown in the right-hand sidebar. Not a secret — put it
   in `wrangler.toml`'s `account_id` field.

2. **KV namespace** (stores chart data between "prepare" and "pay") —
   Cloudflare dashboard → Workers & Pages → **KV** → **Create a namespace** →
   name it `ORDERS` → copy the **Namespace ID** it shows. Not a secret — put
   it in `wrangler.toml`'s `[[kv_namespaces]]` → `id` field.

3. **Add these as GitHub repository secrets** (repo → Settings → Secrets and
   variables → Actions → New repository secret — never put these in any
   file):
   - `CLOUDFLARE_API_TOKEN` — Cloudflare dashboard → My Profile → API Tokens →
     Create Token → use the **"Edit Cloudflare Workers"** template (it grants
     exactly the Workers Scripts + KV permissions this needs).
   - `STRIPE_SECRET_KEY` — dashboard.stripe.com → Developers → API keys.
   - `RESEND_API_KEY` — resend.com → API Keys.
   - `ANTHROPIC_API_KEY` — console.anthropic.com → API Keys.
   - `STRIPE_WEBHOOK_SECRET` — leave for step 5 below; the workflow tolerates
     it being unset for now (empty secret, not a missing one).

4. **Run the deploy.** Either push any change under `worker/`, or go to the
   repo's **Actions** tab → **Deploy fulfillment worker** → **Run workflow**.
   Its log shows the deployed worker's URL, e.g.
   `https://starchart13-fulfillment.<your-subdomain>.workers.dev` — copy it.

5. **Point Stripe at it.** In the Stripe Dashboard → Developers → Webhooks →
   Add endpoint:
   - URL: `<worker URL from step 4>/webhook`
   - Event: `checkout.session.completed`
   - Copy the endpoint's **Signing secret** (`whsec_...`), set it as the
     `STRIPE_WEBHOOK_SECRET` GitHub secret (step 3), then re-run the workflow
     (Actions tab → **Run workflow**) so it takes effect.

6. **Verify sending domain in Resend**, or use their default test domain
   while you're testing. Update `FROM_EMAIL` in `wrangler.toml` once your
   domain is verified.

7. **Wire the frontend to it.** Edit `../reading-config.js`:
   ```js
   fulfillmentApiBase: "https://starchart13-fulfillment.<your-subdomain>.workers.dev",
   ```

8. **Point the Payment Link's confirmation page at `reading-success.html`.**
   In the Stripe Dashboard → Payment Links → open your $25 reading link →
   edit → **After payment** → **Redirect customers to your website** → set
   the URL to:
   ```
   https://starchart13.com/reading-success.html?session_id={CHECKOUT_SESSION_ID}
   ```
   (Stripe substitutes `{CHECKOUT_SESSION_ID}` literally — type it exactly
   like that.) This page never performs fulfillment itself; it just confirms
   payment and optionally polls `/status` to show progress.

## Testing before going live

- Use a Stripe **test mode** secret key + a test Payment Link (or Stripe's
  test card `4242 4242 4242 4242`) so you don't spend real money testing.
- To watch what the worker is doing without a terminal: Cloudflare dashboard →
  your worker → **Logs** tab has a live/real-time view — open it in a browser
  tab while completing a test purchase to see each step (`/prepare` hit,
  webhook received, Claude call, email sent) or catch where it failed.
- If you do have a terminal available, `npx wrangler tail` (from `worker/`)
  does the same thing from the command line, and the Stripe CLI can replay a
  fake event directly at the worker: `stripe trigger checkout.session.completed`
  (after `stripe listen --forward-to <worker URL>/webhook`).

## Costs

All of this fits comfortably in free tiers at low volume: Cloudflare Workers
(100k requests/day free), Cloudflare KV (free tier plenty for this), Resend
(3,000 emails/month free). The only per-order cost is the Claude API call for
the interpretation — typically a few cents per reading.
