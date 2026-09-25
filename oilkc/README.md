# OilKC: Mobile Oil Change Website

This is a simple website for a woman-owned mobile oil-change business in the Kansas City Northland. It's plain HTML, CSS and JavaScript, so you can edit it straight from the GitHub app or github.com on your phone. There's nothing to install and nothing to build.

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | All the words on the website |
| `styles.css` | Colors, fonts and layout |
| `script.js` | Settings (form, payment, phone) and form behavior |
| `README.md` | This guide |
| `.nojekyll` | An empty file that tells GitHub to serve the site as-is. Leave it alone. |

## How to edit a file from your phone

1. Open the repository on github.com (or in the GitHub app, choose **View code** / **Browse code**).
2. Tap the file you want to change, such as `script.js`.
3. Tap the **pencil icon** (Edit).
4. To find text, use your browser's **Find in page** (Chrome on Android: ⋮ menu → **Find in page**).
5. Make your change and tap **Commit changes**, then **Commit changes** again.
6. Wait 1–2 minutes, then refresh your website.

---

## HOW TO LAUNCH ON GITHUB PAGES

1. Open the repository **Settings**.
2. Open **Pages** (in the left menu, under "Code and automation"; on a phone, scroll down to find it).
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, then set the branch to **main** and the folder to **/ (root)**.
4. Tap **Save**.
5. Wait 1–3 minutes and refresh the Pages screen. A link like `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/` appears at the top. Open it; that's your website.

Every link in the site is relative, so it works at a `github.io/repository-name/` address without any changes.

> **Note:** These five files must sit at the **top level** of the repository for "main / root" to work. If they are inside a folder (for example `oilkc/`), move them to the top level of a new repository (such as one named `oilkc`) before you launch.

---

## HOW TO CONNECT FORMSPREE (booking form)

Formspree emails you each booking request. The free plan is enough to start.

1. Go to **formspree.io**, create an account, and tap **New Form**. Name it something like "Oil Change Bookings" and use the email address where you want to get requests.
2. Formspree shows an endpoint that looks like this:
   `https://formspree.io/f/abcdwxyz`
   Copy the whole thing.
3. Open `script.js` and tap the pencil to edit.
4. Near the very top, find this line:
   ```
   formEndpoint: "YOUR_FORMSPREE_ENDPOINT",
   ```
5. Replace only `YOUR_FORMSPREE_ENDPOINT` and keep the quote marks and the comma:
   ```
   formEndpoint: "https://formspree.io/f/abcdwxyz",
   ```
6. Commit changes.
7. Send a test booking from your live site. The first time, Formspree may email you to confirm the form. Click that confirmation link.

Until you do this, the form checks what customers typed but tells them "Online booking isn't connected yet" instead of sending.

---

## HOW TO CONNECT STRIPE (optional, for later)

The site **never charges anyone automatically**. By default the PAY NOW button stays hidden. When you want it:

1. In your Stripe Dashboard, go to **Payment Links** → **+ New**, set up the product and price, and tap **Create link**. Copy the link, which looks like `https://buy.stripe.com/abc123`.
2. Open `script.js` and edit it.
3. Find this line:
   ```
   stripePaymentLink: "YOUR_STRIPE_PAYMENT_LINK",
   ```
   and paste your link inside the quotes:
   ```
   stripePaymentLink: "https://buy.stripe.com/abc123",
   ```
4. To show the button, find this line:
   ```
   const ENABLE_INSTANT_PAYMENT = false;
   ```
   and change `false` to `true`:
   ```
   const ENABLE_INSTANT_PAYMENT = true;
   ```
5. Commit changes.

The PAY NOW button now appears on the "Request Received" screen after someone books. Change `true` back to `false` to hide it again.

Only paste a **Payment Link** (starts with `https://buy.stripe.com/`). **Never** paste a Stripe secret key (starts with `sk_`) anywhere in this website, because anyone can read these files.

---

## HOW TO CHANGE PHONE NUMBER

1. Open `script.js` and edit it.
2. Find this line:
   ```
   businessPhone: "YOUR_PHONE_NUMBER",
   ```
3. Put your number inside the quotes, written the way you want customers to see it:
   ```
   businessPhone: "(816) 555-0123",
   ```
4. Commit changes.

The phone number stays hidden until you set it. After that, a **Call** link appears in the top bar, a **Call or Text** button in the bottom section, and your number in the footer. All of them tap-to-call.

---

## HOW TO CHANGE PRICES

Open `index.html`, edit it, and use Find in page for each item below.

**Service Only price ($50):**
- Search for `<span class="price-amount">$50</span>` and change `50`.
- Search for `$50 Service Only` (it appears **twice** in the booking dropdown, on the same line) and change both.
- Search for `For the $50 service-only option` (in the FAQ) and change it.
- Search for `"priceRange": "$50+"` near the top and change it.

**Full Synthetic price ($95):**
- Search for `<span class="price-amount">$95</span>` and change `95`.
- Search for `$95+ Full Synthetic` (it appears **twice** in the booking dropdown, on the same line) and change both.

**Quarts included (5 quarts):**
- Search for `5 quarts` and update each place you find it.

Tip: the booking dropdown line has the price in a `value="..."` part and between `>` and `<`. Change both so the emails you get match what customers see.

---

## HOW TO CHANGE SERVICE AREA

**The area name** ("Kansas City Northland") appears in the headline, the hero text and the trust row.

1. Open `script.js` and find:
   ```
   serviceArea: "Kansas City Northland"
   ```
2. Change the text inside the quotes, for example `"Kansas City Northland & Clay County"`.
3. Commit. The site updates every spot that shows the area name.

**The list of towns** (North Kansas City, Gladstone, and so on):

1. Open `index.html` and search for `SERVICE AREA LIST`.
2. Right below it, each town is one line like:
   ```
   <li>Gladstone</li>
   ```
3. Edit a name, delete a line to remove a town, or copy a line to add one.

**Search engines and link previews:** the page title and description at the top of `index.html` also mention "Kansas City Northland". Search for `Northland` to find them, and change them if your area changes a lot.

---

## Other easy changes

- **Business name:** the site uses the working name **OilKC**. Search `index.html` for `OilKC` and replace it everywhere (and `Oil<span class="brand-accent">KC</span>` for the logo text) to use your own name.
- **Colors:** open `styles.css`. The first lines define `--violet`, `--cyan` and `--pink`. Change those color codes.
- **Link-preview image (optional):** to show a picture when the link is shared, upload an image (1200×630 works best) named `share.jpg`, then add this line in `index.html` right under the other `og:` lines, using your full site address:
  ```
  <meta property="og:image" content="https://YOUR-USERNAME.github.io/REPOSITORY-NAME/share.jpg">
  ```

## Before launch checklist

- [ ] Formspree endpoint pasted in `script.js`
- [ ] Phone number pasted in `script.js`
- [ ] Stripe Payment Link pasted in `script.js` (it stays hidden until `ENABLE_INSTANT_PAYMENT = true`)
- [ ] Sent a test booking and got the email
- [ ] Checked the site on your phone

**Important:** Don't add claims like "licensed and insured", certifications or warranties unless they are true and current for your business.
