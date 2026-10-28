// WellingtonList.com static site generator. No dependencies.
// Usage: node scripts/build.mjs
// Optional env: SHEET_BUSINESSES_CSV, SHEET_EVENTS_CSV (published Google Sheet CSV URLs; only rows with Approved = yes are published)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "docs");
// Safety check: refuse to build if the live settings were blanked (this once switched off analytics and forms).
{ const cfgText = fs.readFileSync(path.join(SRC, "assets/config.js"), "utf8");
  if (!/ga4:\s*"G-[A-Z0-9]+"/.test(cfgText) || !/formEndpoint:\s*"https:\/\/script\.google\.com/.test(cfgText)) { throw new Error("src/assets/config.js is missing the GA4 ID or form endpoint. Restore them before building."); } }
const SITE = "https://wellingtonlist.com";
const BUILD_DATE = new Date().toISOString().slice(0, 10);
// Cache-busting version for CSS/JS: changes whenever their source changes.
const ASSET_V = (() => { const h = (str) => { let x = 5381; for (let i = 0; i < str.length; i++) x = ((x * 33) ^ str.charCodeAt(i)) >>> 0; return x.toString(36); };
  return h(["assets/base.css", "assets/extra.css", "assets/sponsors.css", "assets/main.js", "assets/config.js"].map(f => fs.readFileSync(path.join(SRC, f), "utf8")).join("")); })();

const read = (p) => fs.readFileSync(path.join(SRC, p), "utf8");
const json = (p) => JSON.parse(read(p));
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (s) => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const write = (rel, html) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  return rel;
};

// ---------- Data ----------
let places = json("data/places.json");
let events = json("data/events.json");
// Newest first: sort by published date, and for posts published the same day, the one added to posts.json last comes first.
const posts = json("data/posts.json").map((p, i) => [p, i]).sort((x, y) => (y[0].published || "").localeCompare(x[0].published || "") || y[1] - x[1]).map(x => x[0]);
// Internal linking: which places each post links to, and which posts mention each place.
const postPlaceLinks = {};
const postsByPlace = {};
for (const p of posts) {
  let html = "";
  try { html = fs.readFileSync(path.join(SRC, "content/blog", p.slug + ".html"), "utf8"); } catch (e) {}
  const slugs = [...new Set([...html.matchAll(/href="\/places\/([^"\/]+)\/"/g)].map(m => m[1]))];
  postPlaceLinks[p.slug] = slugs;
  for (const sl of slugs) (postsByPlace[sl] = postsByPlace[sl] || []).push(p);
}
function relatedPosts(p, n = 6) {
  const mine = new Set(postPlaceLinks[p.slug] || []);
  return posts.filter(x => x.slug !== p.slug).map((x, i) => {
    const shared = (postPlaceLinks[x.slug] || []).filter(sl => mine.has(sl)).length;
    return [x, shared * 3 + (x.category === p.category ? 4 : 0) + Math.max(0, 3 - i / 5)];
  }).sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]);
}

function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter(r => r.some(Boolean)).map(r => Object.fromEntries(head.map((h, i) => [h.trim().toLowerCase(), (r[i] || "").trim()])));
}
async function sheet(url) {
  if (!url) return [];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    return parseCSV(await res.text()).filter(r => /^(y|yes|true|1)$/i.test(r.approved || ""));
  } catch (e) { console.warn("Sheet fetch failed:", url, e.message); return []; }
}
const CAT_MAP = { "pets and vets": "pets", pets: "pets", restaurant: "restaurants", restaurants: "restaurants", "home services": "home", health: "health", "health and medical": "health", equestrian: "equestrian", "real estate": "realestate", shopping: "shopping", pets: "pets", "kids and schools": "kids", "fitness": "fitness", "things to do": "things-to-do", "professional services": "services", "beauty and wellness": "beauty" };
const sheetBiz = await sheet(process.env.SHEET_BUSINESSES_CSV);
for (const r of sheetBiz) {
  const name = r.business_name || r.name; if (!name) continue;
  const slug = slugify(name);
  if (places.some(p => p.slug === slug)) continue;
  places.push({ slug, name, cat: CAT_MAP[(r.category || "").toLowerCase()] || "services", type: r.subcategory || r.category || "Local business", schema: "LocalBusiness",
    address: r.address || "", area: r.area || "Wellington", desc: r.description || "", website: r.website || "", phone: r.phone || "", featured: /yes/i.test(r.featured || ""), sponsored: /yes/i.test(r.sponsored || ""), verified: true });
}
const sheetEvents = await sheet(process.env.SHEET_EVENTS_CSV);
for (const r of sheetEvents) {
  if (!r.event_name || !r.start_date) continue;
  events.push({ slug: slugify(r.event_name + "-" + r.start_date), title: r.event_name, start: r.start_date, end: r.end_date || r.start_date, venue: r.venue || "", address: r.address || "", desc: r.description || "", url: r.link || "" });
}
const todayISO = BUILD_DATE;
events = events.filter(e => (e.end || e.start) >= todayISO).sort((a, b) => a.start.localeCompare(b.start));

const CATS = [
  { id: "restaurants", label: "Restaurants", blurb: "Dining, cafes, takeout" },
  { id: "things-to-do", label: "Things to do", blurb: "Venues, Town Center, fun" },
  { id: "parks", label: "Parks and nature", blurb: "Preserves, trails, fields" },
  { id: "equestrian", label: "Equestrian", blurb: "Showgrounds, polo, dressage" },
  { id: "shopping", label: "Shopping", blurb: "Malls and plazas" },
  { id: "nearby", label: "Nearby day trips", blurb: "Within a short drive" },
  { id: "coming-soon", label: "Coming soon", blurb: "New developments" },
  { id: "home", label: "Home services", blurb: "Pool, HVAC, roofing, lawn" },
  { id: "health", label: "Health and medical", blurb: "Doctors, dentists, urgent care" },
  { id: "realestate", label: "Real estate", blurb: "Agents, lenders, title" },
  { id: "pets", label: "Pets and vets", blurb: "Veterinarians and pet care" },
  { id: "fitness", label: "Fitness and gyms", blurb: "Gyms, Pilates, studios" },
  { id: "beauty", label: "Beauty and spas", blurb: "Salons, nails, med spas" },
  { id: "schools", label: "Schools", blurb: "Public, charter and private" },
  { id: "services", label: "Local services", blurb: "Everything else" }
];
const catLabel = (id) => (CATS.find(c => c.id === id) || { label: "Local" }).label;
const fmtDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const fmtShort = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dateChip = (e, yr) => { const d = new Date(e.start + "T12:00:00"); const mon = d.toLocaleDateString("en-US", { month: "short" }); return e.dateNote ? `<b style="font-size:17px">${mon}</b><small>TBA</small>` : `<b>${d.getDate()}</b><small>${mon}${yr ? " " + d.getFullYear() : ""}</small>`; };
const mapsLink = (p) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.name + " " + (p.address || "Wellington, FL"));

// ---------- Shared chrome ----------
const logoSymbol = read("assets/logo-symbol.svg");
const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${logoSymbol}</svg>`;
const logo = (light) => `<a class="brand" href="/" aria-label="Wellington List home"><span class="logo-tile${light ? " logo-tile-light" : ""}"><svg width="36" height="36" viewBox="0 0 64 64"><use href="#logo"/></svg></span><span class="brand-name">Wellington List<span>Wellington, Florida</span></span></a>`;

const NAV = [["/blog/", "News"], ["/directory/", "Directory"], ["/restaurants/", "Eat and Drink"], ["/services/", "Services"], ["/things-to-do/", "Things to Do"], ["/events/", "Events"], ["/equestrian/", "Equestrian"]];

// ---------- Local sponsor spots (9 paid + 1 Advertise card, data in src/data/sponsors.json) ----------
const SP = json("data/sponsors.json");
const SP_PRICE = SP.price || 49;
const SP_CHECKOUT = SP.checkout || "/advertise/#claim";
const SP_SLOTS = SP.slots.slice(0, 9);
const SP_TOTAL = SP_SLOTS.length;
const SP_OPEN = SP_SLOTS.filter(s => !s.name).length;
const spInitial = (n) => esc(String(n).trim().charAt(0).toUpperCase());
const spLeft = SP_OPEN ? `${SP_OPEN} of ${SP_TOTAL} spots left` : "Join the waitlist";
const spCard = (s) => s.name
  ? `<a class="sp-card" href="${esc(s.url || "/advertise/")}" target="_blank" rel="sponsored noopener" data-sp="${s.slot}"><span class="sp-logo">${s.logo ? `<img src="${esc(s.logo)}" alt="" loading="lazy">` : spInitial(s.name)}</span>${s.category ? `<span class="sp-cat">${esc(s.category)}</span>` : ""}<span class="sp-name">${esc(s.name)}</span>${s.tagline ? `<span class="sp-tag">${esc(s.tagline)}</span>` : ""}</a>`
  : `<a class="sp-card open" href="/advertise/" data-sp="${s.slot}"><span class="sp-logo" aria-hidden="true">+</span><span class="sp-name">Your business here</span><span class="sp-tag">Sponsor spot ${s.slot}</span></a>`;
const spAdCard = `<a class="sp-card sp-ad" href="/advertise/"><span class="sp-ad-ring" aria-hidden="true"></span><span class="sp-ad-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg></span><span class="sp-name">Advertise here</span><span class="sp-ad-left">${spLeft}</span><span class="sp-ad-price">$${SP_PRICE}/month</span></a>`;
const sponsorRails = `
<aside class="sp-rail left" aria-label="Local sponsors"><div class="sp-rail-label">Local sponsors</div>${SP_SLOTS.slice(0, 5).map(spCard).join("")}</aside>
<aside class="sp-rail right" aria-label="Local sponsors"><div class="sp-rail-label">Local sponsors</div>${SP_SLOTS.slice(5, 9).map(spCard).join("")}${spAdCard}</aside>`;
const spBarItems = (() => {
  const items = SP_SLOTS.filter(s => s.name).map(s => `<a class="sp-bar-item" href="${esc(s.url || "/advertise/")}" target="_blank" rel="sponsored noopener"><span class="sp-logo">${s.logo ? `<img src="${esc(s.logo)}" alt="" loading="lazy">` : spInitial(s.name)}</span><b>${esc(s.name)}</b>${s.tagline ? `<span class="t">${esc(s.tagline)}</span>` : ""}</a>`);
  items.push(`<a class="sp-bar-item sp-bar-ad" href="/advertise/"><span class="sp-bar-dot" aria-hidden="true"></span><b>Advertise here</b><span class="t">${spLeft}</span><span class="sp-ad-price">$${SP_PRICE}/mo</span></a>`);
  items[0] = items[0].replace("sp-bar-item", "sp-bar-item on");
  return items.join("");
})();
const sponsorBar = `<div class="sp-bar"><div class="wrap"><span class="sp-bar-label">Local sponsor</span>${spBarItems}</div></div>`;
const sponsorShowcase = `
<section class="sp-show" aria-labelledby="sp-show-h"><div class="wrap">
  <div class="sp-show-head"><div><h2 id="sp-show-h">Wellington's local sponsors</h2><p>The local businesses that help keep Wellington List free.</p></div><a class="sp-count" href="/advertise/">${spLeft} &middot; $${SP_PRICE}/month &rarr;</a></div>
  <div class="sp-grid">${SP_SLOTS.map(spCard).join("")}${spAdCard}</div>
</div></section>`;
// In-page sponsor placements: the wide banners are retired; sidebars show the Advertise card.
const sponsor = (variant = "leader") => variant === "rect" ? `<div class="sp-side">${spAdCard}</div>` : "";
const newsletter = ""; // email signup removed for now

const footer = `
<footer>
  <div class="wrap">
    <div class="foot">
      <div class="foot-brand">${logo(true)}<p>An independent local guide to Wellington, Florida, serving 33414, 33449 and 33467.</p></div>
      <div><h2 class="foot-h">Read</h2><ul><li><a href="/blog/">News and guides</a></li><li><a href="/events/">Events</a></li><li><a href="/equestrian/">Equestrian</a></li><li><a href="/things-to-do/">Things to do</a></li></ul></div>
      <div><h2 class="foot-h">Find</h2><ul><li><a href="/restaurants/">Restaurants</a></li><li><a href="/directory/?cat=parks">Parks</a></li><li><a href="/directory/?cat=shopping">Shopping</a></li><li><a href="/directory/">Full directory</a></li></ul></div>
      <div><h2 class="foot-h">Popular guides</h2><ul><li><a href="/blog/best-dentists-wellington-fl/">Best dentists</a></li><li><a href="/blog/schools-in-wellington-fl-guide/">Schools and grades</a></li><li><a href="/blog/hospitals-urgent-care-wellington-fl/">ER and urgent care</a></li><li><a href="/blog/best-coffee-shops-wellington-fl/">Coffee shops</a></li><li><a href="/blog/lotis-wellington-restaurants-guide/">Lotis restaurants</a></li><li><a href="/blog/winter-equestrian-festival-2027-guide/">WEF 2027 dates</a></li></ul></div>
      <div><h2 class="foot-h">Work with us</h2><ul><li><a href="/add-your-business/">Add your business</a></li><li><a href="/advertise/">Advertise</a></li><li><a href="/submit-event/">Submit an event</a></li><li><a href="/about/">About</a></li></ul></div>
    </div>
    <div class="legal"><span>&copy; <span id="yr">${new Date().getFullYear()}</span> Wellington List. Independent and not affiliated with the Village of Wellington.</span><span><a href="mailto:hello@wellingtonlist.com">hello@wellingtonlist.com</a> &nbsp; <a href="/privacy/">Privacy</a> &nbsp; <a href="/about/">About</a></span></div>
  </div>
</footer>`;

function layout({ title, description, urlPath, body, jsonld = [], ogType = "website", noindex = false, article = null, image = "", sponsors = true, bodyClass = "", ads = false }) {
  const ogImg = image ? SITE + image : SITE + "/assets/og.jpg";
  const canonical = SITE + urlPath;
  const org = { "@context": "https://schema.org", "@type": "Organization", "@id": SITE + "/#org", name: "Wellington List", url: SITE + "/", logo: SITE + "/assets/icon-512.png", areaServed: { "@type": "City", name: "Wellington, Florida" } };
  const ld = [org, ...jsonld].map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta property="og:site_name" content="Wellington List">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImg}">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ogImg}">
${article ? `<meta property="article:published_time" content="${article.published}">\n<meta property="article:modified_time" content="${article.updated}">` : ""}
<meta name="theme-color" content="#1D5631">
<meta name="geo.region" content="US-FL">
<meta name="geo.placename" content="Wellington">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="Wellington List" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css?v=${ASSET_V}">
${ld}
${ads ? '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9929351005136304" crossorigin="anonymous"></script>' : ""}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}>
${sprite}
<a class="sr" href="#main">Skip to content</a>
<header class="site"><div class="wrap">
  ${logo(false)}
  <nav class="main" id="mainnav" aria-label="Main">${NAV.map(([h, l]) => `<a href="${h}"${urlPath.startsWith(h) ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
  <a class="btn btn-primary header-cta" href="/add-your-business/">Add your business</a>
  <button class="menu-toggle" aria-expanded="false" aria-controls="mainnav">Menu</button>
</div></header>
${sponsors ? sponsorBar + "\n" + sponsorRails : ""}
<main id="main">
${body}
</main>
${sponsors ? sponsorShowcase : ""}
${footer}
<script src="/assets/config.js?v=${ASSET_V}"></script>
<script src="/assets/main.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

const crumbsHTML = (items) => `<nav class="crumbs" aria-label="Breadcrumb">${items.map((it, i) => (i < items.length - 1 ? `<a href="${it[1]}">${esc(it[0])}</a><span aria-hidden="true">/</span>` : `<span aria-current="page">${esc(it[0])}</span>`)).join("")}</nav>`;
const crumbsLD = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it[0], item: SITE + it[1] })) });
const pageHead = (crumbs, h1, sub, extra = "") => `
<section class="page-head"><svg class="hero-mark" viewBox="0 0 64 64" aria-hidden="true"><use href="#logo"/></svg>
  <div class="wrap">${crumbsHTML(crumbs)}<h1>${h1}</h1>${sub ? `<p>${sub}</p>` : ""}${extra}</div>
</section>`;

const listingCard = (p) => `
<article class="listing${p.sponsored ? " sponsored" : ""}" data-cat="${p.cat}" data-search="${esc((p.name + " " + p.type + " " + (p.cuisine || "") + " " + p.desc + " " + (p.area || "") + " " + catLabel(p.cat)).toLowerCase())}">
  <div class="listing-top"><span>${esc(p.type)}</span>${p.sponsored ? '<span class="pill spons">Sponsored</span>' : p.verified ? '<span class="pill ver">Verified</span>' : ""}</div>
  <h3 class="h4"><a href="/places/${p.slug}/">${esc(p.name)}</a></h3>
  <p>${esc(p.desc)}</p>
  <div class="meta"><span>${esc(p.area || "Wellington")}</span><a href="/places/${p.slug}/">Details</a></div>
</article>`;

const postCard = (p) => `
<article class="post-card">
  <a class="thumb" href="/blog/${p.slug}/" aria-label="${esc(p.h1)}">${coverImg(p) || '<svg viewBox="0 0 64 64" aria-hidden="true"><use href="#logo"/></svg>'}</a>
  <div class="pad"><div class="tag">${esc(p.category)}</div><h3><a href="/blog/${p.slug}/">${esc(p.h1)}</a></h3><p>${esc(p.description)}</p><div class="byline">${fmtDate(p.published)} &middot; ${p.readMins} min read</div></div>
</article>`;

const coverFile = (p) => fs.existsSync(path.join(SRC, "covers", p.slug + ".jpg")) ? `/assets/covers/${p.slug}.jpg` : "";
const coverImg = (p, eager) => coverFile(p) ? `<img src="${coverFile(p)}" alt="${esc(p.coverAlt || p.h1)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} width="1600" height="900">` : "";
const pages = []; // for sitemap: [path, lastmod, priority]
const add = (urlPath, html, priority = "0.7", lastmod = BUILD_DATE) => { write(urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "") + "index.html", html); pages.push([urlPath, lastmod, priority]); };

// ---------- Home ----------
{
  const featured = places.filter(p => p.featured).slice(0, 9);
  const counts = Object.fromEntries(CATS.map(c => [c.id, places.filter(p => p.cat === c.id).length]));
  const lead = posts[0], rest = posts.slice(1, 10);
  const body = `
<section class="hero"><svg class="hero-mark" viewBox="0 0 64 64" aria-hidden="true"><use href="#logo"/></svg>
  <div class="wrap">
    <h1>Everything happening in Wellington, in one place.</h1>
    <p class="lede">Local news, trusted businesses, restaurants, events and the equestrian season, covered by people who live here.</p>
    <form class="search" role="search" action="/directory/" method="get">
      <label><span class="sr">Search</span><input name="q" type="search" placeholder="Search restaurants, parks, polo, sushi..."></label>
      <select name="cat" aria-label="Category"><option value="all">All categories</option>${CATS.filter(c => counts[c.id]).map(c => `<option value="${c.id}">${c.label}</option>`).join("")}</select>
      <button class="btn btn-primary" type="submit">Search Wellington</button>
    </form>
    <div class="quick"><span>Popular:</span><a href="/restaurants/">Restaurants</a><a href="/things-to-do/">Things to do</a><a href="/equestrian/">WEF 2027</a><a href="/blog/village-landing-wellington-k-park/">Village Landing</a><a href="/events/">Events</a></div>
  </div>
</section>
<div class="wrap">${sponsor()}</div>

<section class="block" id="news"><div class="wrap">
  <div class="sec-head"><h2>Wellington news</h2><a href="/blog/">All news</a></div>
  <div class="news-grid"><div class="news-main">
    <article class="lead-story">
      <a class="img" href="/blog/${lead.slug}/" style="display:grid;place-items:center" aria-label="${esc(lead.h1)}">${coverImg(lead, true) || '<svg viewBox="0 0 64 64" width="34%" style="color:#fff" aria-hidden="true"><use href="#logo"/></svg>'}</a>
      <div class="tag">${esc(lead.category)}</div>
      <h3><a href="/blog/${lead.slug}/">${esc(lead.h1)}</a></h3>
      <p>${esc(lead.description)}</p><div class="byline">${fmtDate(lead.published)} &middot; ${lead.readMins} min read</div>
    </article>
    <ul class="story-list">
      ${rest.map(p => `<li><div class="tag">${esc(p.category)}</div><h4><a href="/blog/${p.slug}/">${esc(p.h1)}</a></h4><div class="byline">${fmtDate(p.published)}</div></li>`).join("")}
      <li><div class="tag">Guide</div><h4><a href="/things-to-do/">The best things to do in Wellington, FL</a></h4><div class="byline">Guide</div></li>
      <li><div class="tag">Eat and Drink</div><h4><a href="/restaurants/">Wellington's most popular restaurants</a></h4><div class="byline">Guide</div></li>
      <li><div class="tag">Equestrian</div><h4><a href="/equestrian/">A local's guide to Wellington's equestrian season</a></h4><div class="byline">Guide</div></li>
    </ul>
  </div>
  <aside class="rail" id="events"><div><h3>Coming up</h3>
    <ul class="events">${events.slice(0, 4).map(e => `<li><div class="date">${dateChip(e)}</div><div><strong><a href="/events/#${e.slug}">${esc(e.title)}</a></strong><span>${esc(e.venue)}</span></div></li>`).join("")}</ul>
    <a class="btn btn-ghost" href="/submit-event/">Submit an event</a></div>
    ${sponsor("rect")}
  </aside></div>
</div></section>

<section class="block" id="directory"><div class="wrap">
  <div class="sec-head"><h2>The Wellington directory</h2><a href="/directory/">Browse everything</a></div>
  <div class="cats">${CATS.filter(c => counts[c.id]).slice(0, 7).map(c => `<a class="cat" href="/directory/?cat=${c.id}"><svg viewBox="0 0 64 64"><use href="#logo"/></svg><div><strong>${c.label}</strong><span>${counts[c.id]} places</span></div></a>`).join("")}<a class="cat" href="/add-your-business/"><svg viewBox="0 0 64 64"><use href="#logo"/></svg><div><strong>Add your business</strong><span>Free listing</span></div></a></div>
  <div class="sec-head" style="margin-top:48px"><h2 style="font-size:26px">Local favorites</h2><a href="/add-your-business/">Add your business</a></div>
  <div class="listings">${featured.map(listingCard).join("")}</div>
</div></section>

<section class="block equine" id="equestrian"><div class="wrap">
  <div class="sec-head"><h2>Equestrian Wellington</h2><a href="/equestrian/">Season guide</a></div>
  <div class="eq-grid">
    <div class="countdown"><h3>Winter Equestrian Festival 2027</h3><p>January 6 to April 4 at Wellington International, 3400 Equestrian Club Drive.</p>
      <div class="clock" aria-live="off"><div><b id="cd-d">--</b><small>days</small></div><div><b id="cd-h">--</b><small>hours</small></div><div><b id="cd-m">--</b><small>minutes</small></div><div><b id="cd-s">--</b><small>seconds</small></div></div></div>
    <ul class="eq-links">
      <li><a href="/places/wellington-international/">Wellington International <span>Show jumping</span></a></li>
      <li><a href="/places/national-polo-center/">National Polo Center <span>Polo</span></a></li>
      <li><a href="/places/global-dressage-festival/">Global Dressage Festival <span>Dressage</span></a></li>
      <li><a href="/events/">Season calendar <span>Events</span></a></li>
      <li><a href="/equestrian/">Spectator guide <span>Guide</span></a></li>
    </ul>
  </div>
</div></section>

<section class="block" id="realestate"><div class="wrap">
  <div class="sec-head"><h2>Living in Wellington</h2><a href="/blog/village-landing-wellington-k-park/">What's being built</a></div>
  <div class="re-grid">
    <ul class="hoods">${["Olympia", "Palm Beach Polo", "Grand Isles", "Village Walk", "Equestrian Preserve", "Saddle Trail", "Wellington Shores", "Black Diamond"].map(h => `<li>${h}</li>`).join("")}</ul>
    <div>
      <div class="agent"><span class="pill spons">Featured agent</span><div class="avatar">You</div>
        <div><h3 class="h4" style="font-family:var(--serif);font-weight:500;font-size:24px;margin:0">Your name here</h3><p>The featured agent spot appears across Wellington List's real estate and neighborhood coverage.</p><a class="btn btn-ghost" href="/advertise/">Claim this spot</a></div></div>
      <p class="advert-note">Local business? Reach Wellington residents with a founding sponsor spot on every page for $${SP_PRICE}/month. <a href="/advertise/">See advertising options</a></p>
    </div>
  </div>
</div></section>
<div class="wrap">${sponsor()}</div>
${newsletter}`;
  add("/", layout({ ads: true,
    title: "Wellington List | Wellington, FL News, Restaurants, Events and Local Directory",
    description: "Wellington List is the local guide to Wellington, Florida: news, restaurants, things to do, equestrian events, Village Landing updates and a directory of local businesses.",
    urlPath: "/", body,
    jsonld: [{ "@context": "https://schema.org", "@type": "WebSite", "@id": SITE + "/#website", name: "Wellington List", url: SITE + "/", publisher: { "@id": SITE + "/#org" },
      potentialAction: { "@type": "SearchAction", target: SITE + "/directory/?q={search_term_string}", "query-input": "required name=search_term_string" } }]
  }), "1.0");
}

// ---------- Directory (all) ----------
function directoryPage({ urlPath, crumbs, h1, sub, title, description, list, showFilters = true, intro = "" }) {
  const cats = CATS.filter(c => list.some(p => p.cat === c.id));
  const body = pageHead(crumbs, h1, sub) + `<div class="wrap">${sponsor()}</div>
<section class="wrap" style="padding-bottom:40px">
  ${intro}
  ${showFilters ? `<div class="dir-tools"><label class="sr" for="dir-q">Search the directory</label><input id="dir-q" type="search" placeholder="Search by name, cuisine or type">
  <div class="filters" role="group" aria-label="Filter by category"><button aria-pressed="true" data-f="all">All</button>${cats.map(c => `<button aria-pressed="false" data-f="${c.id}">${c.label}</button>`).join("")}</div></div>
  <p class="count-note" id="count-note" role="status">${list.length} places</p>` : ""}
  <div class="listings" data-filter-grid>${list.map(listingCard).join("")}</div>
  <div class="claim" style="margin-top:36px">Own a Wellington business that should be here? <a href="/add-your-business/">Add it to Wellington List for free</a>.</div>
</section>
<div class="wrap">${sponsor()}</div>${newsletter}`;
  const ld = [crumbsLD(crumbs), { "@context": "https://schema.org", "@type": "ItemList", name: h1, itemListElement: list.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/places/${p.slug}/`, name: p.name })) }];
  add(urlPath, layout({ title, description, urlPath, body, jsonld: ld }), "0.9");
}

directoryPage({
  urlPath: "/directory/", crumbs: [["Home", "/"], ["Directory", "/directory/"]],
  h1: "The Wellington, FL directory", sub: "Restaurants, parks, equestrian venues, shopping and local businesses across Wellington, Florida.",
  title: "Wellington, FL Local Directory: Restaurants, Parks, Shopping and Businesses",
  description: "Browse Wellington, Florida's local directory: restaurants, parks, equestrian venues, shopping, things to do and local businesses in 33414, 33449 and 33467.",
  list: places
});

const listIntro = (html) => `<div class="prose prose-narrow" style="margin-bottom:28px">${html}</div>`;
directoryPage({
  urlPath: "/restaurants/", crumbs: [["Home", "/"], ["Restaurants", "/restaurants/"]],
  h1: "The best restaurants in Wellington, FL", sub: "Where Wellington eats, from date night favorites to breakfast spots and late night tacos.",
  title: "Best Restaurants in Wellington, FL (2026 Local Guide)",
  description: "A local guide to the best restaurants in Wellington, Florida: Italian, Argentine, sushi, Greek, burgers, breakfast spots and dessert, updated for 2026.",
  list: places.filter(p => p.cat === "restaurants"),
  intro: listIntro(`<p>Wellington's dining scene stretches from the Wellington Green area near State Road 7 to the plazas along Wellington Trace and the restaurants near the showgrounds on South Shore Boulevard. Below are the spots locals talk about most, grouped so you can filter by type. With <a href="/blog/village-landing-wellington-k-park/">Village Landing</a> adding about 100,000 square feet of restaurant space by 2028, expect this list to grow.</p>`)
});
directoryPage({
  urlPath: "/things-to-do/", crumbs: [["Home", "/"], ["Things to do", "/things-to-do/"]],
  h1: "Things to do in Wellington, FL", sub: "Parks, preserves, world class equestrian venues, shopping and easy day trips.",
  title: "Things to Do in Wellington, FL: Parks, Polo, Horse Shows and Day Trips",
  description: "The best things to do in Wellington, Florida: Peaceful Waters Sanctuary, the Environmental Preserve, Sunday polo, the Winter Equestrian Festival, the amphitheater, shopping and nearby day trips.",
  list: places.filter(p => p.cat !== "restaurants"),
  intro: listIntro(`<p>Wellington is best known as the winter equestrian capital of the world, but there is a lot more here for families and visitors. Start with the free boardwalk at <a href="/places/peaceful-waters-sanctuary/">Peaceful Waters Sanctuary</a>, catch a free show at the <a href="/places/wellington-amphitheater/">Wellington Amphitheater</a>, spend a winter Sunday at the <a href="/places/national-polo-center/">National Polo Center</a>, or climb the observation tower at the <a href="/places/wellington-environmental-preserve/">Wellington Environmental Preserve</a>. For more ideas, see our <a href="/events/">events calendar</a>.</p>`)
});


const SERVICE_PAGES = [
  { slug: "plumbers", guide: "<h2 style=\"font-family:var(--serif);font-weight:500;font-size:24px;margin:22px 0 8px\">Plumbing in Wellington: what to know</h2><p>Most Wellington homes sit on concrete slabs with water lines underneath, so slab leaks, water heater failures in the garage and main line clogs are the calls local plumbers get most. For a leak, shut off the main water valve first, then call. If the problem is at the meter or in the street, call Wellington Utilities at (561) 791-4010, or (561) 791-4037 after hours.</p><p>Need help right now? See our guide to <a href=\"/blog/24-hour-emergency-plumbers-wellington-fl/\">24-hour emergency plumbers in Wellington</a>. Before hiring, look up the plumber's license on myfloridalicense.com; state-certified plumbing contractor licenses start with CFC.</p>", faqs: [{"q": "Is there a 24-hour plumber in Wellington, FL?", "a": "Yes. Good Boy Plumbing on Forest Hill Blvd offers 24/7 emergency dispatch, and Roto-Rooter Wellington, Benjamin Franklin Plumbing and Copperhead Plumbing also advertise 24/7 service. See our emergency plumbers guide for phone numbers."}, {"q": "Who do I call for a water main break in Wellington?", "a": "Call Wellington Utilities at (561) 791-4010 on weekdays or (561) 791-4037 after hours. Buena Vida, Olympia and Villagewalk are served by Palm Beach County Water Utilities at (561) 740-4600, option 1."}, {"q": "Do I need a permit to replace a water heater in Wellington?", "a": "Yes. Wellington lists water heater replacement on its permit fee schedule, and a licensed plumber normally pulls the permit."}], noun: "Plumbers", re: /plumb|rooter/i, blurb: "drain cleaning, leaks, water heaters, backflow testing and emergency repairs", tips: ["Confirm the plumber is licensed in Florida and carries insurance", "Ask whether they charge a trip fee and whether emergency or after-hours rates apply", "For older Wellington homes, ask about repiping and water heater replacement options"] },
  { slug: "ac-repair", guide: "<h2 style=\"font-family:var(--serif);font-weight:500;font-size:24px;margin:22px 0 8px\">AC service in Wellington: what to know</h2><p>In Wellington, air conditioning runs almost year round, and a breakdown in August is an emergency. Regular maintenance, including filter changes, coil cleaning and drain line flushing, helps prevent the most common summer failures, especially clogged condensate lines.</p><p>Most systems last about 10 to 15 years in South Florida's climate. When replacing, ask contractors about SEER2 efficiency ratings, proper sizing for your home and any available utility rebates, and get at least two written quotes.</p>", faqs: [{"q": "How often should AC be serviced in Wellington?", "a": "Most HVAC companies recommend a professional tune-up at least once a year, ideally in spring before peak heat, plus regular filter changes and drain line flushing."}, {"q": "How long does an AC system last in South Florida?", "a": "Systems typically last about 10 to 15 years in South Florida's climate. Frequent repairs, rising energy bills or uneven cooling are signs it may be time to replace."}], noun: "AC Repair Companies", re: /\bac\b|air condition|hvac|duct/i, blurb: "AC repair, new system installation, duct cleaning and maintenance plans", tips: ["Book maintenance in spring before the summer rush", "Ask about maintenance plans, which often include priority service", "Get a written quote and ask about SEER ratings and FPL rebates on new systems"] },
  { slug: "locksmiths", guide: "<h2 style=\"font-family:var(--serif);font-weight:500;font-size:24px;margin:22px 0 8px\">Locksmiths in Wellington: what to know</h2><p>Florida has no state locksmith license, and many \"Wellington locksmith\" search results are out-of-area call centers. Save a vetted local number before you need it, ask for the legal business name and the full price before anyone is dispatched, and expect a real locksmith to ask for proof that you live there or own the car.</p><p>Locked out right now? See our guide to <a href=\"/blog/24-hour-emergency-locksmiths-wellington-fl/\">24-hour emergency locksmiths in Wellington</a>. If a child or pet is locked in a car, call 911 first.</p>", faqs: [{"q": "Is there a 24-hour locksmith in Wellington, FL?", "a": "Yes. Pop-A-Lock of Palm Beach, A Local Locksmith and South Shore Locksmiths advertise 24/7 service for home and car lockouts in Wellington. See our emergency locksmith guide for phone numbers."}, {"q": "Do locksmiths need a license in Florida?", "a": "No. Florida has no professional licensing for locksmiths, so check reviews, ask for ID and the legal business name, and get the full price in writing before work starts."}], noun: "Locksmiths", re: /locksmith|key cutting/i, blurb: "home and car lockouts, rekeying, lock changes, car keys and safes", tips: ["Save a vetted locksmith number before you need one", "Get the total price, including the service call and after-hours fees, before anyone is dispatched", "Rekey your locks when you move into a new home"] },
  { slug: "tree-service", guide: "<h2 style=\"font-family:var(--serif);font-weight:500;font-size:24px;margin:22px 0 8px\">Tree service in Wellington: what to know</h2><p>Schedule storm pruning in spring, before hurricane season starts June 1, and ask for structural pruning rather than topping. For palms, UF/IFAS advises removing only fully brown fronds; skip the \"hurricane cut.\" Wellington does not pick up debris from tree companies, stumps or trunks, so make sure your quote includes haul-away.</p><p>Read our full guide to <a href=\"/blog/tree-trimming-tree-removal-wellington-fl/\">tree trimming and tree removal in Wellington</a>, including Florida's dangerous tree law and FPL power line rules.</p>", faqs: [{"q": "Do I need a permit to remove a tree in Wellington?", "a": "Check with the Village of Wellington and your HOA first. Under Florida Statute 163.045, single-family homeowners with signed documentation from an ISA certified arborist or Florida licensed landscape architect that a tree poses an unacceptable risk cannot be required to get a permit or replant."}, {"q": "Will Wellington pick up tree debris?", "a": "Wellington collects vegetation weekly in pieces under 6 feet and 50 lbs, but not limbs over 10 inches thick or debris from tree companies, removals, stumps or trunks."}], noun: "Tree Services", re: /tree serv|stump|arborist/i, blurb: "tree trimming, palm trimming, tree removal, stump grinding and storm cleanup", tips: ["Look for an ISA Certified Arborist and ask for proof of liability and workers comp insurance", "Get the scope in writing, including debris haul-away and stump grinding", "Avoid anyone who recommends topping trees or hurricane-cutting palms"] },
  { slug: "roofers", noun: "Roofers", re: /roof/i, blurb: "tile, shingle and metal roofs, repairs, replacements and storm damage", tips: ["Check the contractor's Florida roofing license and insurance", "Ask who handles the permit and your HOA approval", "Get photos of any damage and a written scope before work starts, especially for insurance claims"] },
  { slug: "pest-control", noun: "Pest Control Companies", re: /pest|critter|wildlife/i, blurb: "ants, termites, roaches, rodents, mosquitoes and wildlife removal", tips: ["Ask whether treatments are pet and child friendly", "Compare one-time treatments with quarterly plans", "Termite inspections are worth scheduling before buying a home"] },
  { slug: "electricians", noun: "Electricians", re: /electric/i, blurb: "electrical repairs, panel upgrades, lighting, generators and EV chargers", tips: ["Hire a licensed Florida electrical contractor for anything beyond basic fixtures", "Ask about whole-home generators and surge protection before hurricane season", "Get permits pulled for panel upgrades and new circuits"] },
  { slug: "pool-service", guide: "<h2 style=\"font-family:var(--serif);font-weight:500;font-size:24px;margin:22px 0 8px\">Pool service in Wellington: what to know</h2><p>Wellington's heat, summer storms and heavy rain mean pools need steady care year round. Most homeowners use a weekly service that balances chemicals, skims and brushes, empties baskets and checks equipment. Bigger jobs, such as pump and heater replacement, leak detection, acid washing and full resurfacing, usually go to a renovation contractor.</p><p>Pool resurfacing (plaster, quartz or pebble finishes) is typically needed every 10 to 15 years, or sooner if you see rough patches, stains or chipping. It's a good time to update tile and coping too. Wellington pools in HOA communities may need approval before changes to decks, screens or enclosures.</p>", faqs: [{"q": "How often should a pool be resurfaced in Wellington?", "a": "Most plaster, quartz and pebble pool finishes last about 10 to 15 years. Rough surfaces, staining, chipping or frequent algae are signs it's time to call a renovation contractor for a resurfacing quote."}, {"q": "What does weekly pool service include?", "a": "Weekly service usually covers chemical testing and balancing, skimming, brushing, vacuuming, emptying baskets and a quick equipment check. Confirm whether chemicals and filter cleaning are included in the price."}], noun: "Pool Service Companies", re: /pool/i, blurb: "weekly pool cleaning, equipment repair, pool resurfacing, supplies and renovations", tips: ["Ask what weekly service includes, such as chemicals and filter cleaning", "Get equipment checked before summer", "Ask about storm prep for pools during hurricane season", "Pool resurfacing (plaster, pebble or quartz finishes) is typically needed every 10 to 15 years; get at least two quotes and ask about tile and coping work at the same time"] },
  { slug: "landscaping", noun: "Landscaping and Lawn Care Companies", re: /landscap|lawn/i, blurb: "lawn mowing, landscape design, tree and palm trimming and irrigation", tips: ["Check your HOA's landscaping rules before major changes", "Ask about irrigation checks, especially during the dry season", "Schedule tree and palm trimming before hurricane season"] },
  { slug: "dentists", noun: "Dentists", re: /dent|orthodont|endodont|oral surg/i, cats: ["health"], blurb: "family, pediatric and cosmetic dentistry, orthodontics and root canals", tips: ["Call ahead to confirm your dental insurance is accepted", "Ask about new patient specials and emergency appointments", "Pediatric dentists are a good first stop for young kids"] },
  { slug: "doctors-urgent-care", noun: "Doctors, Hospitals and Urgent Care", re: /hospital|urgent|pediatrician|pediatric care|pediatrics|imaging|medical center/i, cats: ["health"], blurb: "hospitals, urgent care, pediatricians and diagnostic imaging", tips: ["For emergencies, call 911 or go to the nearest emergency room", "Urgent care is a good option for minor injuries and illnesses after hours", "Confirm insurance acceptance before your visit"] },
  { slug: "pediatricians", noun: "Pediatricians", re: /pediatrician/i, cats: ["health"], blurb: "well-child visits, vaccines, sick visits and sports physicals for babies, kids and teens", tips: ["Call ahead to confirm the practice is accepting new patients and takes your insurance", "Ask about same-day sick visits and after-hours phone lines", "Schedule back-to-school and sports physicals early in the summer", "For after-hours illness, Wellington has several urgent care centers; for emergencies call 911"] },
  { slug: "pharmacies", noun: "Pharmacies", re: /pharmac/i, cats: ["health"], blurb: "CVS, Walgreens and Publix pharmacies, late-night hours and the nearest 24-hour pharmacy", tips: ["Pharmacy counters usually close earlier than the store and many close 1:30 to 2 p.m. for lunch", "No Wellington pharmacy is currently open 24 hours; the Walgreens on Forest Hill Blvd stays open latest", "Ask your pharmacist about an emergency supply if you run out of a maintenance medication"] },
  { slug: "veterinarians", noun: "Veterinarians", re: /veterin|vet\b|animal/i, cats: ["pets", "equestrian"], blurb: "vets, animal hospitals and equine care", tips: ["Ask about after-hours and emergency options", "Bring vaccination and medical records to your first visit", "Wellington horse owners should keep an equine vet's number handy"] },
  { slug: "real-estate-agents", noun: "Real Estate Agents", re: /real estate|realty/i, blurb: "agents and brokerages who know Wellington neighborhoods, equestrian properties and seasonal rentals", tips: ["Ask which Wellington communities the agent knows best", "Equestrian and seasonal rental properties often need a specialist", "Ask for recent comparable sales before pricing or making an offer"] },
  { slug: "insurance-agents", guide: "<h2 style=\"font-family:var(--serif);font-weight:500;font-size:24px;margin:22px 0 8px\">Insurance in Wellington: what to know</h2><p>Florida home insurance has changed a lot in recent years, so it pays to shop around. Captive agents represent one company, such as State Farm, Allstate or Florida Farm Bureau, while independent agencies can quote several carriers at once. Many Wellington homeowners also need separate flood coverage, since standard homeowners policies don't cover flood damage.</p><p>A wind mitigation inspection can lower Florida home premiums by documenting your roof, shutters and other storm features. Equestrian property owners should ask about farm, horse mortality and equine liability coverage, which not every agent writes.</p>", faqs: [{"q": "Do I need flood insurance in Wellington, FL?", "a": "Standard homeowners policies don't cover flood damage, so many Wellington homeowners buy separate flood insurance through the NFIP or a private carrier. Your lender may require it depending on your flood zone."}, {"q": "What is a wind mitigation inspection?", "a": "It's an inspection that documents storm-resistant features like roof straps, shutters and impact windows. Florida insurers offer premium discounts based on the report, so ask your agent whether one could lower your rate."}], noun: "Insurance Agents", re: /insurance/i, blurb: "home, auto, flood, life and business insurance agents", tips: ["Compare quotes from more than one agent, since Florida home insurance rates vary widely", "Ask about wind mitigation inspections, which can lower premiums", "Review your flood and hurricane coverage before June 1"] },
  { slug: "auto-repair", guide: "<h2 style=\"font-family:var(--serif);font-weight:500;font-size:24px;margin:22px 0 8px\">Auto repair in Wellington: what to know</h2><p>Most of Wellington's independent repair shops sit in the light-industrial areas off Fortune Way and Fairlane Farms Road, just south of Forest Hill Boulevard. Several specialize in European and luxury vehicles, which is useful in a town full of them. Quick-lube and chain shops are a few minutes north on State Road 7 in Royal Palm Beach.</p><p>South Florida heat is hard on batteries, tires and air conditioning, so many drivers have AC systems checked before summer. Ask for a written estimate before work begins, and ask whether the shop uses OEM or aftermarket parts.</p>", faqs: [{"q": "Where are auto repair shops in Wellington?", "a": "Most independent shops are in the Fortune Way and Fairlane Farms Road business areas off Forest Hill Blvd. Chain quick-lube and brake shops are nearby on State Road 7 in Royal Palm Beach."}, {"q": "Are there shops in Wellington that work on European cars?", "a": "Yes. Several Wellington shops, including WBA Performance and Wellington Auto Service, service European and specialty vehicles. Call ahead to confirm they work on your make."}], noun: "Auto Repair Shops and Tire Stores", re: /auto|tire|car dealer/i, blurb: "auto repair, tires, maintenance and dealer service", tips: ["Ask for a written estimate before repairs begin", "Ask whether the shop works on your make, including classic or European cars", "Horse trailer owners should ask about trailer repair and maintenance"] },
  { slug: "gyms", noun: "Gyms and Fitness Studios", re: /gym|fitness|pilates|kickbox|wellness/i, blurb: "gyms, Pilates, kickboxing and boutique fitness studios", tips: ["Most gyms offer a free trial class or day pass", "Ask about contract length and cancellation terms", "Season brings more crowds, so check off-peak hours"] },
  { slug: "hair-salons", noun: "Hair Salons", re: /hair|salon suites|beauty salon/i, blurb: "haircuts, color, styling and blowouts", tips: ["Book color and big appointments a few weeks ahead in season", "Ask for a consultation before major color changes", "Salon suites are a good way to find independent stylists"] },
  { slug: "nail-salons", noun: "Nail Salons", re: /nail/i, blurb: "manicures, pedicures, gel and lashes", tips: ["Walk-ins are easier on weekday mornings", "Ask about sanitation practices and tool sterilization", "Book ahead before holidays and events"] },
  { slug: "med-spas", guide: "<h2 style=\"font-family:var(--serif);font-weight:500;font-size:24px;margin:22px 0 8px\">Choosing a med spa in Wellington</h2><p>Wellington's med spas cluster along Forest Hill Boulevard, South Shore Boulevard and State Road 7. Common treatments include neurotoxins like Botox and Dysport, dermal fillers, laser hair removal, IPL and BBL photofacials, microneedling, HydraFacials and body contouring. Many also offer wellness services such as IV therapy and medical weight loss.</p><p>In Florida, injectables should be performed by or under the supervision of a licensed physician, physician assistant or nurse. Ask who will perform your treatment, what training they have and which devices they use, and book a consultation before committing to a package.</p>", faqs: [{"q": "What treatments do Wellington med spas offer?", "a": "Wellington med spas commonly offer Botox and Dysport, dermal fillers, laser hair removal, IPL and BBL photofacials, microneedling, Morpheus8, HydraFacials, CoolSculpting and wellness services like IV therapy."}, {"q": "How do I choose a safe med spa?", "a": "Ask who performs injectables and lasers and what their medical license and training are, confirm a physician oversees treatments, and start with a consultation before buying a package."}], noun: "Med Spas and Beauty Spas", re: /med spa|beauty spa/i, blurb: "facials, injectables, laser treatments and skin care", tips: ["Ask who performs injectables and their credentials", "Book a consultation before committing to a treatment plan", "Ask about package pricing for laser treatments"] }
];
const SVC_CATS = ["home", "health", "pets", "realestate", "fitness", "beauty", "services", "equestrian"];
const servicePagesBuilt = [];
for (const sp of SERVICE_PAGES) {
  const list = places.filter(p => (sp.cats || SVC_CATS).includes(p.cat) && sp.re.test(p.type + " " + p.name));
  if (list.length < 2) continue;
  servicePagesBuilt.push({ ...sp, count: list.length });
  const url = `/services/${sp.slug}/`;
  const faqs = [
    { q: `How do I find the best ${sp.noun.toLowerCase()} in Wellington, FL?`, a: `Start with providers based in or regularly serving Wellington, check licensing and reviews, and get more than one quote for bigger jobs. This page lists ${list.length} options for ${sp.blurb}.` },
    ...(sp.faqs || []),
    { q: `Do these ${sp.noun.toLowerCase()} serve all of Wellington?`, a: `Most serve all Wellington ZIP codes, including 33414, 33449 and 33467, plus nearby Royal Palm Beach, Loxahatchee and Lake Worth. Call to confirm they cover your address.` }
  ];
  const intro = listIntro(`<p>Looking for the best ${sp.noun.toLowerCase()} in Wellington, Florida? Here are ${list.length} local providers for ${sp.blurb} in and around Wellington, with addresses and phone numbers where available.</p>${sp.guide || ""}<h2 style="font-family:var(--serif);font-weight:500;font-size:24px;margin:22px 0 8px">Tips for hiring ${sp.noun.toLowerCase()} in Wellington</h2><ul>${sp.tips.map(t => `<li>${t}</li>`).join("")}</ul><p>Own one of these businesses? <a href="/add-your-business/">Claim or add your listing</a> for free. Want to be the featured provider on this page? <a href="/advertise/">See sponsorship options</a>.</p>`)
    + `<div class="prose prose-narrow" style="margin:28px 0"><h2 style="font-family:var(--serif);font-weight:500;font-size:24px">Frequently asked questions</h2>${faqs.map(f => `<h3 style="font-size:17px;margin:16px 0 4px">${f.q}</h3><p>${f.a}</p>`).join("")}</div>`;
  directoryPage({
    urlPath: url, crumbs: [["Home", "/"], ["Local services", "/services/"], [sp.noun, url]],
    h1: `Best ${sp.noun} in Wellington, FL`, sub: `Local ${sp.noun.toLowerCase()} serving Wellington and the western communities: ${sp.blurb}.`,
    title: `Best ${sp.noun} in Wellington, FL (${new Date(BUILD_DATE).getFullYear()} Guide)`,
    description: `Find the best ${sp.noun.toLowerCase()} in Wellington, Florida: ${list.length} local options for ${sp.blurb}, with addresses, phone numbers and hiring tips.`,
    list, showFilters: false, intro
  });
}
const serviceLinks = `<div class="prose prose-narrow" style="margin-bottom:24px"><h2 style="font-family:var(--serif);font-weight:500;font-size:24px">Browse by service</h2><p>${SERVICE_PAGES.filter(sp => places.filter(p => (sp.cats || SVC_CATS).includes(p.cat) && sp.re.test(p.type + " " + p.name)).length >= 2).map(sp => `<a href="/services/${sp.slug}/">${sp.noun}</a>`).join(" &middot; ")}</p></div>`;
directoryPage({
  urlPath: "/services/", crumbs: [["Home", "/"], ["Local services", "/services/"]],
  h1: "Local services in Wellington, FL", sub: "AC and plumbing, pool service, dentists, doctors, veterinarians and real estate, serving Wellington and the western communities.",
  title: "Wellington, FL Local Services: AC, Plumbers, Pool Service, Dentists, Vets and More",
  description: "Find local services in Wellington, Florida: air conditioning repair, plumbers, pool service, dentists, pediatricians, urgent care, veterinarians and real estate offices.",
  list: places.filter(p => ["home", "health", "pets", "realestate", "fitness", "beauty", "schools", "services"].includes(p.cat)),
  intro: listIntro(`<p>From AC repair in the middle of August to a pediatrician on a Saturday morning, these are local providers in and around Wellington. Listings include the business address and phone where available. Own a Wellington business? <a href="/add-your-business/">Add it free</a>, and providers can claim their listing to add hours, photos and services.</p>`) + serviceLinks
});

// ---------- Equestrian guide ----------
{
  const eq = places.filter(p => p.cat === "equestrian");
  const crumbs = [["Home", "/"], ["Equestrian", "/equestrian/"]];
  const body = pageHead(crumbs, "Wellington's equestrian season: a local's guide", "When the shows run, where to watch, and how to enjoy the winter season like a local.") + `<div class="wrap">${sponsor()}</div>
<div class="wrap body-grid"><article class="prose">
  <p class="lede">Every winter, Wellington becomes the center of the horse world. Here is how the season works and where to go.</p>
  <h2>The big three venues</h2>
  <p><a href="/places/wellington-international/">Wellington International</a> hosts the Winter Equestrian Festival, which runs January 6 to April 4, 2027. The <a href="/places/national-polo-center/">National Polo Center</a> hosts the Palm Beach polo season from December 27, 2026 to May 2, 2027. <a href="/places/global-dressage-festival/">Equestrian Village</a> on South Shore Boulevard is home to the Adequan Global Dressage Festival, typically January through March.</p>
  <h2>Tips for first-time spectators</h2>
  <ul><li>Weekend evening grand prix classes and Sunday polo are the most social and the most crowded.</li><li>Many daytime classes are free or low cost to watch, so weekday visits are a great way to start.</li><li>Expect heavier traffic on South Shore Boulevard, Pierson Road and 120th Avenue South during the season.</li><li>Dress for sun, and bring cash or a card for food vendors.</li></ul>
  <h2>Season calendar</h2>
  <ul>${events.map(e => `<li><a href="/events/#${e.slug}">${esc(e.title)}</a>: ${e.dateNote ? esc(e.dateNote) : fmtDate(e.start) + (e.end && e.end !== e.start ? " to " + fmtDate(e.end) : "")}</li>`).join("")}</ul>
  <h2>Equestrian venues in the directory</h2>
</article><aside><div class="sticky-rail">${sponsor("rect")}</div></aside></div>
<section class="wrap" style="padding-bottom:48px"><div class="listings">${eq.map(listingCard).join("")}</div></section>
<div class="wrap">${sponsor()}</div>${newsletter}`;
  add("/equestrian/", layout({ title: "Wellington Equestrian Season Guide 2026 to 2027: WEF, Polo and Dressage", description: "When and where to watch the Winter Equestrian Festival, Sunday polo and the Global Dressage Festival in Wellington, FL, plus spectator tips from locals.", urlPath: "/equestrian/", body, jsonld: [crumbsLD(crumbs)] }), "0.9");
}

// ---------- Place pages ----------
const AREA_TEXT = {
  "Wellington Trace": "in the Wellington Trace shopping area, a cluster of local restaurants and shops in central Wellington near the Courtyard Shops",
  "Forest Hill Blvd": "on Forest Hill Boulevard, Wellington's main east-west corridor lined with the village's busiest plazas",
  "State Road 7": "along the State Road 7 corridor on Wellington's eastern edge, near The Mall at Wellington Green",
  "Wellington Green": "in the Wellington Green area beside The Mall at Wellington Green on State Road 7",
  "South Shore Blvd": "on South Shore Boulevard, close to the equestrian district and the Wellington International showgrounds",
  "Polo Club Rd": "near Polo Club Road in the heart of Wellington's equestrian and polo community",
  "Fairlane Farms": "on Fairlane Farms Road near Wellington's commerce and business park area",
  "Town Center": "at Wellington Town Center on Forest Hill Boulevard, next to Lake Wellington",
  "Equestrian Preserve": "in Wellington's Equestrian Preserve, the heart of the village's horse country",
  "Pierson Road": "on Pierson Road in the western part of the village",
  "K-Park": "on the K-Park site at State Road 7 and Stribling Way",
  "National Polo Center": "at the National Polo Center on 120th Avenue South"
};
const CAT_TIPS = {
  restaurants: ["Hours and menus change, so check the restaurant's website or call ahead before you go", "Weekend evenings and the winter equestrian season are the busiest times", "Many Wellington restaurants offer takeout and delivery through their own sites"],
  home: ["Ask whether the company is licensed and insured in Florida before work begins", "Get a written estimate, and compare at least two quotes for bigger jobs", "Ask about maintenance plans, which can lower costs over time"],
  health: ["Call ahead to confirm they accept your insurance", "Ask about new patient availability and wait times", "For emergencies, call 911 or go to the nearest emergency room"],
  pets: ["Call ahead to confirm new patient availability", "Bring your pet's vaccination and medical records to the first visit", "Ask about after-hours and emergency options"],
  realestate: ["Ask which Wellington neighborhoods the agent knows best", "Equestrian and seasonal rental properties often need a specialist", "Ask for recent comparable sales before pricing or making an offer"]
};
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
for (const p of places) {
  const listUrl = p.cat === "restaurants" ? "/restaurants/" : `/directory/?cat=${p.cat}`;
  const crumbs = [["Home", "/"], [catLabel(p.cat), listUrl], [p.name, `/places/${p.slug}/`]];
  const sameType = places.filter(x => x.slug !== p.slug && x.cat === p.cat && (p.cuisine ? x.cuisine === p.cuisine : x.type === p.type)).slice(0, 4);
  const nearby = places.filter(x => x.slug !== p.slug && p.area && x.area === p.area && !sameType.includes(x)).slice(0, 4);
  const more = sameType.length + nearby.length < 4 ? places.filter(x => x.slug !== p.slug && x.cat === p.cat && !sameType.includes(x) && !nearby.includes(x)).slice(0, 4 - sameType.length - nearby.length) : [];
  const street = p.address && /^\d/.test(p.address) ? p.address : "";
  const addrParts = street.match(/^(.*),\s*([^,]+),\s*FL\s*(\d{5})$/);
  const isNearby = (p.area || "").includes("nearby");
  const city = isNearby && p.address ? p.address.split(",").slice(-2, -1)[0].trim() : "Wellington";
  const areaText = AREA_TEXT[p.area] || (isNearby ? `a short drive from Wellington in ${city}` : "in Wellington, Florida");
  const kind = p.cat === "restaurants" ? (p.cuisine ? p.cuisine.toLowerCase() + " " : "") + (/(bar|tavern|saloon|lounge)/i.test(p.type) ? "spot" : "restaurant") : p.type.toLowerCase();
  const tips = (p.tips && p.tips.length ? p.tips : CAT_TIPS[p.cat] || []);
  const faq = [
    { q: `Where is ${p.name} located?`, a: p.address ? `${p.name} is located at ${p.address}, ${areaText}.` : `${p.name} is ${areaText}. Use the directions button for the exact location.` },
    ...(p.cat === "restaurants" ? [{ q: `What kind of food does ${p.name} serve?`, a: `${p.name} is a ${p.type.toLowerCase()} spot in ${city}. ${p.desc}` }] : [{ q: `What does ${p.name} offer?`, a: `${p.name} is listed under ${catLabel(p.cat).toLowerCase()} (${p.type.toLowerCase()}). ${p.desc}` }]),
    { q: `What are ${p.name}'s hours?`, a: p.hours ? `${p.name} hours: ${p.hours}. Hours can change on holidays and during season, so ${p.phone ? "call " + p.phone : "check ahead"} to confirm.` : p.website ? `Hours can change seasonally, so check ${hostOf(p.website)} or call ahead before visiting.` : `Hours can change seasonally, so call ahead or check the business's official listing before visiting.` },
    ...(p.phone ? [{ q: `What is the phone number for ${p.name}?`, a: `You can reach ${p.name} at ${p.phone}.` }] : [])
  ];
  const ldPlace = {
    "@context": "https://schema.org", "@type": p.schema || "LocalBusiness", name: p.name, description: p.desc, url: `${SITE}/places/${p.slug}/`,
    ...(addrParts ? { address: { "@type": "PostalAddress", streetAddress: addrParts[1], addressLocality: addrParts[2], addressRegion: "FL", postalCode: addrParts[3], addressCountry: "US" } } : { address: { "@type": "PostalAddress", addressLocality: isNearby ? city : "Wellington", addressRegion: "FL", addressCountry: "US" } }),
    ...(p.phone ? { telephone: p.phone } : {}), ...(p.openingHours ? { openingHours: p.openingHours } : {}), ...(p.priceRange ? { priceRange: p.priceRange } : {}), ...(p.cuisine ? { servesCuisine: p.cuisine } : {}), ...(p.website ? { sameAs: [p.website] } : {})
  };
  const ldFaq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  const telHref = p.phone ? "tel:+1" + p.phone.replace(/\D/g, "").replace(/^1/, "") : "";
  const actions = `<div class="pl-actions"><a class="btn btn-primary" href="${mapsLink(p)}" rel="noopener" target="_blank">Get directions</a>${p.phone ? `<a class="btn btn-ghost" href="${telHref}">Call ${esc(p.phone)}</a>` : ""}${p.website ? `<a class="btn btn-ghost" href="${esc(p.website)}" rel="noopener nofollow" target="_blank">Visit website</a>` : ""}</div>`;
  const facts = `<dl class="pl-facts">
      <div><dt>Category</dt><dd><a href="${listUrl}">${esc(catLabel(p.cat))}</a></dd></div>
      <div><dt>Type</dt><dd>${esc(p.type)}</dd></div>
      <div><dt>${p.address ? "Address" : "Area"}</dt><dd>${esc(p.address || p.area || "Wellington, FL")}</dd></div>
      ${p.hours ? `<div><dt>Hours</dt><dd>${esc(p.hours)}</dd></div>` : ""}
      ${p.phone ? `<div><dt>Phone</dt><dd><a href="${telHref}">${esc(p.phone)}</a></dd></div>` : ""}
      ${p.website ? `<div><dt>Website</dt><dd><a href="${esc(p.website)}" rel="noopener nofollow" target="_blank">${esc(hostOf(p.website))}</a></dd></div>` : ""}
    </dl>`;
  const miniList = (title, list) => list.length ? `<section class="pl-section"><h2>${title}</h2><ul class="pl-mini">${list.map(x => `<li><a href="/places/${x.slug}/"><strong>${esc(x.name)}</strong><span>${esc(x.type)}${x.area ? " &middot; " + esc(x.area) : ""}</span></a></li>`).join("")}</ul></section>` : "";
  const extras = [p.hours ? "Hours" : "", p.phone ? "Phone" : "", p.cat === "restaurants" ? "Menu" : "", street ? "Address" : ""].filter(Boolean).slice(0, 3);
  const nameHasCity = new RegExp(city, "i").test(p.name);
  const lead = nameHasCity ? `${p.name} in ${city}, FL` : `${p.name} ${city}, FL`;
  const title = p.title || ((p.hours || p.phone) && p.cat !== "coming-soon" ? `${lead}: ${extras.join(", ").replace(/, ([^,]*)$/, " & $1")}` : `${p.name}, ${city} FL: ${p.type}${p.cat === "restaurants" && street ? ", " + street.split(",")[0] : ""}`);
  const body = `
<section class="pl-head"><div class="wrap">
  ${crumbsHTML(crumbs)}
  <div class="pl-title"><div><span class="pill ver" style="background:rgba(255,255,255,.14);color:#fff">${esc(catLabel(p.cat))}</span><h1>${esc(p.name)}</h1><p>${esc(p.type)}${p.area ? " &middot; " + esc(p.area) : ""}</p></div></div>
  ${actions}
</div></section>
<div class="wrap">${sponsor()}</div>
<div class="wrap pl-grid">
  <article class="pl-main">
    <section class="pl-section"><h2>About ${esc(p.name)}</h2>
      ${p.status ? `<p class="pl-lede" style="border-left:4px solid #c9a227;padding-left:12px"><strong>Status:</strong> ${esc(p.status)}</p>` : ""}
      <p class="pl-lede">${esc(p.desc)}</p>
      <p>${esc(p.name)} is ${areaText}. ${p.cat === "restaurants" ? `It is one of ${places.filter(x => x.cat === "restaurants").length} places to eat and drink in our <a href="/restaurants/">Wellington restaurant guide</a>${p.cuisine ? `, and part of the village's ${esc(p.cuisine)} dining scene` : ""}.` : `Browse more ${esc(catLabel(p.cat).toLowerCase())} in our <a href="${listUrl}">Wellington directory</a>.`}</p>
      ${p.link ? `<p><a href="${p.link}">Read our full guide</a></p>` : ""}
    </section>
    ${(postsByPlace[p.slug] || []).length ? `<section class="pl-section"><h2>Featured in our Wellington guides</h2><ul class="tips">${postsByPlace[p.slug].slice(0, 6).map(x => `<li><a href="/blog/${x.slug}/">${esc(x.h1)}</a></li>`).join("")}</ul></section>` : ""}
    ${tips.length ? `<section class="pl-section"><h2>Good to know</h2><ul class="tips">${tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul></section>` : ""}
    <section class="pl-section"><h2>Frequently asked questions</h2><div class="faq" style="margin-top:0">${faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div></section>
    ${miniList(p.cuisine ? `More ${esc(p.cuisine)} spots in Wellington` : `Similar ${esc(catLabel(p.cat).toLowerCase())}`, sameType.concat(more))}
    ${miniList(`Also ${p.area && !isNearby ? "on " + esc(p.area) : "nearby"}`, nearby)}
    <div class="claim">Own or manage ${esc(p.name)}? <a href="/add-your-business/?claim=${p.slug}">Claim this listing</a> to add photos, hours and your menu or services, or <a href="/add-your-business/?claim=${p.slug}">suggest an edit</a>.</div>
  </article>
  <aside><div class="sticky-rail">
    <div class="pl-card">
      <h2>At a glance</h2>
      ${facts}
      <a class="btn btn-primary" style="width:100%" href="${mapsLink(p)}" rel="noopener" target="_blank">Get directions</a>
    </div>
  </div></aside>
</div>
<div class="wrap">${sponsor()}</div>${newsletter}`;
  const firstSentence = p.desc.split(/(?<=[a-z]{3}\.)\s/)[0];
  const cut = (t, n) => t.length <= n ? t : t.slice(0, n - 3).replace(/[\s,;:]+\S*$/, "") + "...";
  let tail = [street ? `${street.split(",")[0]}, ${city}.` : "", p.phone ? `Call ${p.phone}.` : ""].filter(Boolean).join(" ");
  if (p.hours && (tail + p.hours).length < 75) tail = `${tail} Hours: ${p.hours.replace(/\.$/, "")}.`.trim();
  const budget = Math.max(80, 158 - tail.length - 1);
  let desc = cut(firstSentence, budget);
  if ((desc + " " + tail).length <= 160) desc = (desc + " " + tail).trim();
  if (p.meta) desc = p.meta;
  add(`/places/${p.slug}/`, layout({ title, description: desc, urlPath: `/places/${p.slug}/`, body, jsonld: [crumbsLD(crumbs), ldPlace, ldFaq] }), "0.6");
}

// ---------- Events ----------
{
  const crumbs = [["Home", "/"], ["Events", "/events/"]];
  const evLD = events.map(e => ({ "@context": "https://schema.org", "@type": "Event", name: e.title, startDate: e.start, endDate: e.end || e.start, eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode", description: e.desc,
    location: { "@type": "Place", name: e.venue, address: e.address || "Wellington, FL" }, ...(e.url ? { url: e.url } : {}),
    image: [e.image ? SITE + e.image : SITE + "/assets/og.jpg"],
    organizer: { "@type": "Organization", name: e.organizer || e.venue, url: e.organizerUrl || e.url || SITE + "/events/" },
    performer: { "@type": "PerformingGroup", name: e.performer || e.title },
    offers: { "@type": "Offer", url: e.url || SITE + "/events/#" + e.slug, availability: "https://schema.org/InStock", validFrom: e.start, ...(e.price !== undefined ? { price: String(e.price), priceCurrency: "USD" } : {}) } }));
  const body = pageHead(crumbs, "Events in Wellington, FL", "Horse shows, polo, festivals and community events happening in and around Wellington.") + `<div class="wrap">${sponsor()}</div>
<div class="wrap body-grid"><div>
  <ul class="event-list">${events.map(e => `<li class="event-item" id="${e.slug}"><div class="date">${dateChip(e, true)}</div>
    <div><h3>${esc(e.title)}</h3><div class="when">${e.dateNote ? esc(e.dateNote) : fmtDate(e.start) + (e.end && e.end !== e.start ? " to " + fmtDate(e.end) : "")}</div>
    <p>${esc(e.desc)}</p><p><strong>${e.venueSlug ? `<a href="/places/${e.venueSlug}/">${esc(e.venue)}</a>` : esc(e.venue)}</strong>${e.address ? ", " + esc(e.address) : ""}</p>${e.url ? `<p><a href="${esc(e.url)}" rel="noopener" target="_blank">Event details</a></p>` : ""}</div></li>`).join("")}</ul>
  <div class="claim" style="margin-top:32px">Hosting something in Wellington? <a href="/submit-event/">Submit your event</a> and we will add it to the calendar for free.</div>
</div><aside><div class="sticky-rail">${sponsor("rect")}</div></aside></div>
<div class="wrap">${sponsor()}</div>${newsletter}`;
  add("/events/", layout({ title: "Wellington, FL Events Calendar 2026 to 2027: Horse Shows, Polo and Festivals", description: "Upcoming events in Wellington, Florida: the 2027 Winter Equestrian Festival, Palm Beach polo season, Global Dressage Festival and community events.", urlPath: "/events/", body, jsonld: [crumbsLD(crumbs), ...evLD] }), "0.9");
}

// ---------- Blog ----------
{
  const crumbs = [["Home", "/"], ["News", "/blog/"]];
  const body = pageHead(crumbs, "Wellington news and guides", "Development updates, new openings, schools, events and everything happening in Wellington, Florida.") + `<div class="wrap">${sponsor()}</div>
<section class="wrap" style="padding:20px 0 48px"><div class="post-grid">${posts.map(postCard).join("")}</div></section>
<div class="wrap">${sponsor()}</div>${newsletter}`;
  add("/blog/", layout({ title: "Wellington, FL News and Local Guides | Wellington List", description: "Local news and guides for Wellington, Florida: Village Landing at K-Park, Wingrove Academy, new restaurants, events and more.", urlPath: "/blog/", body, jsonld: [crumbsLD(crumbs)] }), "0.9");

  for (const p of posts) {
    const urlPath = `/blog/${p.slug}/`;
    const crumbsP = [["Home", "/"], ["News", "/blog/"], [p.h1, urlPath]];
    const content = read(`content/blog/${p.slug}.html`);
    const toc = [...content.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/g)];
    const others = relatedPosts(p, 6);
    const body = pageHead(crumbsP, esc(p.h1), "", `<div class="article-meta"><span>By Wellington List staff</span><span>Published <time datetime="${p.published}">${fmtDate(p.published)}</time></span>${p.updated !== p.published ? `<span>Updated <time datetime="${p.updated}">${fmtDate(p.updated)}</time></span>` : ""}<span>${p.readMins} min read</span></div>`) + `<div class="wrap">${sponsor()}</div>
<div class="wrap body-grid">
  <article class="prose">
    ${coverFile(p) ? `<figure class="cover">${coverImg(p, true)}</figure>` : ""}
    ${content}
    <section class="faq" id="faq"><h2>Frequently asked questions</h2>${p.faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</section>
    <section class="sources"><h2 style="font-size:20px">Sources</h2><ul>${p.sources.map(s => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.name)}</a></li>`).join("")}</ul>
    <p>Details on developments and schools can change. We update this guide as new information is announced. Spot something out of date? <a href="/submit-event/">Send us a tip</a>.</p></section>
    <div class="author-box"><span class="logo-tile"><svg width="36" height="36" viewBox="0 0 64 64"><use href="#logo"/></svg></span><span>Written by the Wellington List team, an independent local guide covering Wellington, Florida.</span></div>
    ${others.length ? `<div class="related"><h2>Keep reading</h2><div class="post-grid">${others.map(postCard).join("")}</div></div>` : ""}
  </article>
  <aside><div class="sticky-rail">
    ${toc.length ? `<nav class="toc" aria-label="In this article"><h2>In this article</h2><ol>${toc.map(m => `<li><a href="#${m[1]}">${m[2]}</a></li>`).join("")}<li><a href="#faq">FAQ</a></li></ol></nav>` : ""}
    <div style="margin-top:24px">${sponsor("rect")}</div>
  </div></aside>
</div>
<div class="wrap">${sponsor()}</div>${newsletter}`;
    const ld = [crumbsLD(crumbsP),
      { "@context": "https://schema.org", "@type": "NewsArticle", headline: p.title.slice(0, 110), description: p.description, datePublished: p.published, dateModified: p.updated, mainEntityOfPage: SITE + urlPath, image: [SITE + (coverFile(p) || "/assets/og.jpg")],
        author: { "@type": "Organization", name: "Wellington List", url: SITE + "/about/" }, publisher: { "@id": SITE + "/#org" }, about: { "@type": "Place", name: "Wellington, Florida" } },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }];
    add(urlPath, layout({ title: p.seoTitle, description: p.description, urlPath, body, jsonld: ld, ogType: "article", article: p, image: coverFile(p), ads: true }), "0.8", p.updated);
  }
}

// ---------- Forms ----------
const formPage = ({ urlPath, crumb, h1, sub, title, description, form, side }) => {
  const crumbs = [["Home", "/"], [crumb, urlPath]];
  const body = pageHead(crumbs, h1, sub) + `<div class="wrap body-grid"><div>${form}</div><aside><div class="sticky-rail">${side || sponsor("rect")}</div></aside></div>${newsletter}`;
  add(urlPath, layout({ title, description, urlPath, body, jsonld: [crumbsLD(crumbs)] }), "0.5");
};
const hp = `<span class="hp"><label>Leave blank<input name="website_url_hp" tabindex="-1" autocomplete="off"></label></span>`;
const catOptions = CATS.filter(c => c.id !== "coming-soon" && c.id !== "nearby").map(c => `<option>${c.label}</option>`).join("");

formPage({
  urlPath: "/add-your-business/", crumb: "Add your business", h1: "Add your business to Wellington List",
  sub: "Free listings for Wellington businesses. Submit your details and we will review and publish your listing, usually within a few days.",
  title: "Add Your Business to Wellington List | Free Wellington, FL Business Listing",
  description: "Get your Wellington, Florida business listed free on Wellington List, the local directory for Wellington residents. Claim or update an existing listing.",
  form: `<form class="form" data-wl-form="Businesses" data-success="Thanks! We received your listing and will review it shortly.">
    <input type="hidden" name="claim_listing" value="">
    <div class="row"><label>Business name<input name="business_name" required></label><label>Category<select name="category" required><option value="">Choose one</option>${catOptions}</select></label></div>
    <div class="row"><label>Type of business <span class="hint">For example: sushi, pool service, pediatrics</span><input name="subcategory"></label><label>Phone<input name="phone" type="tel" autocomplete="tel"></label></div>
    <label>Street address<input name="address" placeholder="12345 Forest Hill Blvd, Wellington, FL 33414"></label>
    <div class="row"><label>Website<input name="website" type="url" placeholder="https://"></label><label>Your email <span class="hint">Not published</span><input name="email" type="email" required autocomplete="email"></label></div>
    <label>Short description <span class="hint">Two or three sentences about what you do</span><textarea name="description" maxlength="600"></textarea></label>
    <label><span><input type="checkbox" name="interested_in_featured" value="yes"> I'm interested in a featured or sponsored placement</span></label>
    ${hp}<button class="btn btn-primary" type="submit">Submit listing</button><div class="status" role="status"></div></form>`,
  side: `<div class="info-card"><strong>What happens next</strong><ul class="tips"><li>We verify the business is in or serves Wellington</li><li>Your listing goes live with its own page</li><li>Want to stand out? Ask about featured placement</li></ul><a class="btn btn-ghost" href="/advertise/">See sponsorship options</a></div>`
});
formPage({
  urlPath: "/submit-event/", crumb: "Submit an event", h1: "Submit a Wellington event",
  sub: "Community events, fundraisers, grand openings, shows and classes in or near Wellington. Free to submit.",
  title: "Submit an Event | Wellington, FL Events Calendar",
  description: "Add your Wellington, Florida event to the Wellington List events calendar for free. Community events, fundraisers, grand openings and more.",
  form: `<form class="form" data-wl-form="Events" data-success="Thanks! Your event was submitted and will appear after a quick review.">
    <label>Event name<input name="event_name" required></label>
    <div class="row"><label>Start date<input name="start_date" type="date" required></label><label>End date <span class="hint">Optional</span><input name="end_date" type="date"></label></div>
    <div class="row"><label>Start time<input name="start_time" type="time"></label><label>Venue<input name="venue" required></label></div>
    <label>Address<input name="address"></label>
    <div class="row"><label>Event link<input name="link" type="url" placeholder="https://"></label><label>Your email <span class="hint">Not published</span><input name="email" type="email" required autocomplete="email"></label></div>
    <label>Description<textarea name="description" maxlength="800"></textarea></label>
    ${hp}<button class="btn btn-primary" type="submit">Submit event</button><div class="status" role="status"></div></form>`
});

// ---------- Advertise ----------
{
  const crumbs = [["Home", "/"], ["Advertise", "/advertise/"]];
  const st = SP.stats || {};
  const href = SP_OPEN ? esc(SP_CHECKOUT) : "mailto:hello@wellingtonlist.com?subject=Sponsor%20waitlist";
  const cta = (label, cls = "adv-btn") => `<a class="${cls}" href="${href}" rel="noopener" data-checkout>${SP_OPEN ? label : "Join the waitlist"}<span aria-hidden="true">&rarr;</span></a>`;
  const left = SP_OPEN ? `${SP_OPEN} of ${SP_TOTAL} founding spots left` : "All spots taken";
  const body = `
<section class="adv-hero"><svg class="hero-mark" viewBox="0 0 64 64" aria-hidden="true"><use href="#logo"/></svg>
  <div class="wrap adv-hero-grid">
    <div>
      ${crumbsHTML(crumbs)}
      <span class="adv-pill"><span class="sp-bar-dot" aria-hidden="true"></span>${left}</span>
      <h1>Put your business on every page of Wellington List</h1>
      <p class="adv-sub">Reach Wellington residents every day for <strong>$${SP_PRICE}/month</strong>. Only ${SP_TOTAL} local sponsors at a time.</p>
      ${cta(`Claim my spot for $${SP_PRICE}/month`)}
      <p class="adv-fine">Secure checkout with Stripe &middot; Month to month &middot; Cancel anytime</p>
    </div>
    <div class="adv-preview" aria-hidden="true">
      <span class="adv-preview-label">Your sponsor card</span>
      <div class="sp-card adv-demo"><span class="sp-logo">Y</span><span class="sp-cat">Your category</span><span class="sp-name">Your Business Name</span><span class="sp-tag">Your one-line tagline goes here</span></div>
      <span class="adv-preview-note">Shown on every page, linked to your website</span>
    </div>
  </div>
</section>

<section class="adv-sec"><div class="wrap">
  <h2 class="adv-h">Wellington is finding us on Google</h2>
  <div class="adv-stats">
    <div><b>${esc(st.impressions28 || "")}</b><span>Google search impressions in the last 28 days</span></div>
    <div><b>${esc(st.impressions7 || "")}</b><span>in the last 7 days alone, and climbing</span></div>
    <div><b>${places.length}</b><span>Wellington businesses and places listed</span></div>
    <div><b>${posts.length}</b><span>local news stories and guides, with new ones every day</span></div>
  </div>
  <p class="adv-src">Search data from Google Search Console as of ${esc(st.asOf || "")}</p>
</div></section>

<section class="adv-sec adv-alt"><div class="wrap">
  <h2 class="adv-h">What you get for $${SP_PRICE}/month</h2>
  <div class="adv-gets">
    <div><span class="adv-ico">1</span><b>Your card on every page</b><p>Logo, name, category and tagline, linked to your website, in the sidebars on desktop and the sponsor bar on phones.</p></div>
    <div><span class="adv-ico">2</span><b>Only ${SP_TOTAL} sponsors</b><p>No crowded ad wall. You share the spotlight with just a few other local businesses.</p></div>
    <div><span class="adv-ico">3</span><b>Founding price, locked in</b><p>The price for new sponsors goes up as traffic grows. Founding sponsors keep $${SP_PRICE}/month for as long as they stay.</p></div>
  </div>
</div></section>

<section class="adv-sec"><div class="wrap">
  <h2 class="adv-h">Live in three steps</h2>
  <ol class="adv-steps">
    <li><b>Claim your spot</b><span>Check out with Stripe in about a minute</span></li>
    <li><b>Send your logo and tagline</b><span>Email them to hello@wellingtonlist.com</span></li>
    <li><b>Go live</b><span>Your card goes up across the site, usually within one business day</span></li>
  </ol>
  <div class="adv-final">
    <span class="adv-pill adv-pill-light"><span class="sp-bar-dot" aria-hidden="true"></span>${left}</span>
    <h2>Lock in $${SP_PRICE}/month before the price goes up</h2>
    ${cta("Claim my spot", "adv-btn adv-btn-white")}
  </div>
  <p class="adv-q">Questions first? Email us at <a href="mailto:hello@wellingtonlist.com">hello@wellingtonlist.com</a></p>
</div></section>

<div class="adv-sticky" aria-hidden="true"><div class="wrap"><span class="adv-sticky-txt"><span class="sp-bar-dot"></span><b class="adv-long">${left}</b><b class="adv-short">${SP_OPEN ? `${SP_OPEN} of ${SP_TOTAL} spots left` : "All spots taken"}</b><span class="adv-sticky-price"> &middot; $${SP_PRICE}/month</span></span>${cta("Claim my spot", "adv-btn adv-btn-sm")}</div></div>`;
  add("/advertise/", layout({ title: "Advertise in Wellington, FL | Wellington List Sponsorships", description: `Become a founding sponsor of Wellington List: your business on every page of the site for $${SP_PRICE}/month. Only ${SP_TOTAL} spots.`, urlPath: "/advertise/", body, jsonld: [crumbsLD(crumbs)], sponsors: false, bodyClass: "adv-page" }), "0.6");

  // Post-checkout thank-you page (Stripe redirects here). Not in the sitemap.
  const tcrumbs = [["Home", "/"], ["Advertise", "/advertise/"], ["Thank you", "/advertise/thanks/"]];
  const tbody = pageHead(tcrumbs, "You're a Wellington List sponsor!", "Thank you for supporting independent local news in Wellington.") + `
<div class="wrap" style="padding:44px 0"><div class="prose prose-narrow">
  <p class="lede">Your sponsor spot is reserved. One more step and it goes live.</p>
  <h2>Send us your details</h2>
  <p>Email <a href="mailto:hello@wellingtonlist.com?subject=My%20Wellington%20List%20sponsor%20spot">hello@wellingtonlist.com</a> with:</p>
  <ul><li>Your logo (a square image works best)</li><li>A one-line tagline, up to about 40 characters</li><li>Your business category, such as Dentist or AC repair</li><li>The website address your card should link to</li></ul>
  <p>We'll have your spot live across the site, usually within one business day, and send you a link when it's up. You can manage or cancel your subscription anytime from your Stripe receipt email.</p>
  <p><a class="btn btn-primary" href="/">Back to Wellington List</a></p>
</div></div>`;
  write("advertise/thanks/index.html", layout({ title: "Thank you | Wellington List Sponsors", description: "Thank you for sponsoring Wellington List.", urlPath: "/advertise/thanks/", body: tbody, noindex: true, sponsors: false }));
}

// ---------- About, privacy, 404 ----------
{
  const crumbs = [["Home", "/"], ["About", "/about/"]];
  add("/about/", layout({ title: "About Wellington List | Independent Local Guide to Wellington, FL", description: "Wellington List is an independent, locally run guide to Wellington, Florida covering news, restaurants, events and local businesses.", urlPath: "/about/",
    body: pageHead(crumbs, "About Wellington List", "") + `<div class="wrap" style="padding:44px 0"><div class="prose prose-narrow">
    <p class="lede">Wellington List is an independent local guide to Wellington, Florida, built by a Wellington resident for the people who live, work and visit here.</p>
    <p>Wellington has world class equestrian venues, beautiful parks and a growing list of places to eat, but there has never been one place that brings it all together. That is what we are building: local news in plain English, honest guides, an events calendar and a directory of the businesses that make Wellington work.</p>
    <h2>Our standards</h2><p>We link to our sources, label sponsored content clearly and update our guides when facts change. Sponsors never pay for coverage in our news and guides.</p>
    <h2>Get in touch</h2><p>Have a news tip, an event or a correction? <a href="/submit-event/">Send it here</a>. Own a business? <a href="/add-your-business/">Add your listing</a>. Interested in sponsoring? <a href="/advertise/">See advertising options</a>.</p>
    <p>Prefer email? Reach us anytime at <a href="mailto:hello@wellingtonlist.com">hello@wellingtonlist.com</a></p>
    <p>Wellington List is independent and is not affiliated with the Village of Wellington.</p></div></div>`, jsonld: [crumbsLD(crumbs)] }), "0.4");
}
{
  const crumbs = [["Home", "/"], ["Privacy", "/privacy/"]];
  add("/privacy/", layout({ title: "Privacy Policy | Wellington List", description: "How Wellington List handles information submitted through our forms and analytics.", urlPath: "/privacy/",
    body: pageHead(crumbs, "Privacy policy", "") + `<div class="wrap" style="padding:44px 0"><div class="prose prose-narrow">
    <p>Last updated ${fmtDate(BUILD_DATE)}. This policy explains what information WellingtonList.com ("Wellington List," "we") collects, how we use it, and your choices. Wellington List is an independent local publication and is not affiliated with the Village of Wellington.</p>
    <h2>Information you give us</h2><p>When you submit a form on this site, such as adding a business, submitting an event, or asking about advertising, we collect what you enter: for example your name, email address, phone number, business or event details, and any message. We use it to review and publish your listing or event, respond to you, and run the site.</p>
    <h2>How submissions are processed</h2><p>Form submissions are stored in a private Google Sheet operated with Google Workspace tools. To keep the directory accurate and free of spam, business and event submissions may be reviewed automatically using an AI service (Anthropic's Claude), which may check publicly available information on the web. A person may also review any submission. Only approved business and event details are published.</p>
    <h2>What we publish</h2><p>Business and event details you submit for publication (such as name, address, phone, website and description) may appear on the site and in search engines. We never publish the contact email address you give us on a submission form.</p>
    <h2>Analytics and cookies</h2><p>We use Google Analytics to understand how visitors use the site, such as which pages are viewed, how long visits last, the general location (city or region) and the type of device and browser. Google Analytics uses cookies and similar technologies, and Google may process this data under its own privacy policy. We do not use this data to identify you personally. You can block cookies in your browser settings or use the <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener nofollow">Google Analytics opt-out browser add-on</a>. We do not sell your personal information.</p>
    <h2>Advertising</h2><p>Some pages on this site show ads served by Google AdSense. Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this website or other websites. Google's use of advertising cookies enables it and its partners to serve ads to you based on your visits to this site and/or other sites on the Internet. You may opt out of personalized advertising by visiting <a href="https://www.google.com/settings/ads" rel="noopener nofollow">Google Ads Settings</a>, or opt out of some third-party vendors' use of cookies for personalized advertising at <a href="https://www.aboutads.info/choices/" rel="noopener nofollow">aboutads.info</a>. Learn more in <a href="https://policies.google.com/technologies/ads" rel="noopener nofollow">how Google uses information from sites that use its services</a>.</p>
    <h2>Sponsors and links</h2><p>Some placements on the site are paid sponsorships and are labeled as advertisements. This site links to other websites, including businesses we list. We are not responsible for the privacy practices of other sites.</p>
    <h2>How long we keep information</h2><p>We keep submissions as long as needed to operate the directory and respond to you. You can ask us to update or delete a listing or your submission at any time.</p>
    <h2>Children</h2><p>This site is intended for a general audience and is not directed to children under 13. We do not knowingly collect personal information from children.</p>
    <h2>Your choices and contact</h2><p>To correct or remove a listing, or to ask about the information we hold about you, email <a href="mailto:hello@wellingtonlist.com">hello@wellingtonlist.com</a> We may update this policy from time to time, and the date at the top shows the latest version.</p></div></div>`, jsonld: [crumbsLD(crumbs)] }), "0.2");
}
write("404.html", layout({ title: "Page not found | Wellington List", description: "This page could not be found.", urlPath: "/404.html", noindex: true,
  body: pageHead([["Home", "/"], ["Not found", "/404.html"]], "We couldn't find that page", "Try the directory, the latest news, or head back home.") + `<div class="wrap" style="padding:44px 0;display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn-primary" href="/">Home</a><a class="btn btn-ghost" href="/directory/">Directory</a><a class="btn btn-ghost" href="/blog/">News</a></div>` }));

// ---------- Assets, sitemap, robots, feed ----------
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
fs.writeFileSync(path.join(OUT, "assets/site.css"), read("assets/base.css") + read("assets/extra.css") + read("assets/sponsors.css") +"\n.foot-h{font-size:14px;color:#fff;margin:0 0 14px;font-weight:600;font-family:var(--sans)}\n.h4{font-family:var(--serif);font-weight:500;font-size:22px;margin:2px 0 0;line-height:1.2}\n");
for (const f of ["main.js", "config.js"]) fs.copyFileSync(path.join(SRC, "assets", f), path.join(OUT, "assets", f));
for (const f of fs.readdirSync(path.join(SRC, "static"))) fs.copyFileSync(path.join(SRC, "static", f), path.join(OUT, f.startsWith("asset-") ? "assets/" + f.slice(6) : f));

if (fs.existsSync(path.join(SRC, "covers"))) { fs.mkdirSync(path.join(OUT, "assets/covers"), { recursive: true }); for (const f of fs.readdirSync(path.join(SRC, "covers"))) fs.copyFileSync(path.join(SRC, "covers", f), path.join(OUT, "assets/covers", f)); }
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(([u, m, pr]) => `  <url><loc>${SITE}${u}</loc><lastmod>${m}</lastmod><priority>${pr}</priority></url>`).join("\n")}
</urlset>
`);
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
write("feed.xml", `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Wellington List</title><link>${SITE}/</link><description>Local news and guides for Wellington, Florida</description>
${posts.map(p => `<item><title>${esc(p.title)}</title><link>${SITE}/blog/${p.slug}/</link><guid>${SITE}/blog/${p.slug}/</guid><pubDate>${new Date(p.published + "T12:00:00Z").toUTCString()}</pubDate><description>${esc(p.description)}</description></item>`).join("\n")}
</channel></rss>
`);
write("CNAME", "wellingtonlist.com\n");
write(".nojekyll", "");
console.log(`Built ${pages.length} pages, ${places.length} places, ${events.length} events, ${posts.length} posts.`);
