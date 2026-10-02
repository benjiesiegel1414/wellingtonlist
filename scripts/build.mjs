// WellingtonList.com static site generator. No dependencies.
// Usage: node scripts/build.mjs
// Optional env: SHEET_BUSINESSES_CSV, SHEET_EVENTS_CSV (published Google Sheet CSV URLs; only rows with Approved = yes are published)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "docs");
const SITE = "https://wellingtonlist.com";
const BUILD_DATE = new Date().toISOString().slice(0, 10);

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
const posts = json("data/posts.json");

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
const CAT_MAP = { restaurant: "restaurants", restaurants: "restaurants", "home services": "home", health: "health", "health and medical": "health", equestrian: "equestrian", "real estate": "realestate", shopping: "shopping", pets: "pets", "kids and schools": "kids", "fitness": "fitness", "things to do": "things-to-do", "professional services": "services", "beauty and wellness": "beauty" };
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
  { id: "services", label: "Local services", blurb: "Everything else" }
];
const catLabel = (id) => (CATS.find(c => c.id === id) || { label: "Local" }).label;
const fmtDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const fmtShort = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dateChip = (e, yr) => { const d = new Date(e.start + "T12:00:00"); const mon = d.toLocaleDateString("en-US", { month: "short" }); return e.dateNote ? `<b style="font-size:17px">${mon}</b><small>TBA</small>` : `<b>${d.getDate()}</b><small>${mon}${yr ? " " + d.getFullYear() : ""}</small>`; };
const mapsLink = (p) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.name + " " + (p.address || "Wellington, FL"));

// ---------- Shared chrome ----------
const horseSymbol = read("assets/horse-symbol.svg");
const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${horseSymbol}</svg>`;
const logo = (light) => `<a class="brand" href="/" aria-label="Wellington List home"><span class="logo-tile${light ? " logo-tile-light" : ""}"><svg width="30" height="38"><use href="#horse"/></svg></span><span class="brand-name">Wellington List<span>Wellington, Florida</span></span></a>`;

const NAV = [["/blog/", "News"], ["/directory/", "Directory"], ["/restaurants/", "Eat and Drink"], ["/things-to-do/", "Things to Do"], ["/events/", "Events"], ["/equestrian/", "Equestrian"]];

const sponsor = (variant = "leader") => `
<div class="sponsor sponsor-${variant}"><small>Advertisement</small>
  <a class="sponsor-card" href="/advertise/">
    <span><strong>Sponsor WellingtonList.com</strong><span>Promote your local business or service here, in front of Wellington residents every day.</span></span>
    <span class="cta">Become a sponsor</span>
  </a>
</div>`;

const newsletter = ""; // email signup removed for now

const footer = `
<footer>
  <div class="wrap">
    <div class="foot">
      <div class="foot-brand">${logo(true)}<p>An independent local guide to Wellington, Florida, serving 33414, 33449 and 33467.</p></div>
      <div><h2 class="foot-h">Read</h2><ul><li><a href="/blog/">News and guides</a></li><li><a href="/events/">Events</a></li><li><a href="/equestrian/">Equestrian</a></li><li><a href="/things-to-do/">Things to do</a></li></ul></div>
      <div><h2 class="foot-h">Find</h2><ul><li><a href="/restaurants/">Restaurants</a></li><li><a href="/directory/?cat=parks">Parks</a></li><li><a href="/directory/?cat=shopping">Shopping</a></li><li><a href="/directory/">Full directory</a></li></ul></div>
      <div><h2 class="foot-h">Work with us</h2><ul><li><a href="/add-your-business/">Add your business</a></li><li><a href="/advertise/">Advertise</a></li><li><a href="/submit-event/">Submit an event</a></li><li><a href="/about/">About</a></li></ul></div>
    </div>
    <div class="legal"><span>&copy; <span id="yr">${new Date().getFullYear()}</span> Wellington List. Independent and not affiliated with the Village of Wellington.</span><span><a href="/privacy/">Privacy</a> &nbsp; <a href="/about/">About</a></span></div>
  </div>
</footer>`;

function layout({ title, description, urlPath, body, jsonld = [], ogType = "website", noindex = false, article = null, image = "" }) {
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
<link rel="stylesheet" href="/assets/site.css?v=${BUILD_DATE}">
${ld}
</head>
<body>
${sprite}
<a class="sr" href="#main">Skip to content</a>
<header class="site"><div class="wrap">
  ${logo(false)}
  <nav class="main" id="mainnav" aria-label="Main">${NAV.map(([h, l]) => `<a href="${h}"${urlPath.startsWith(h) ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
  <a class="btn btn-primary header-cta" href="/add-your-business/">Add your business</a>
  <button class="menu-toggle" aria-expanded="false" aria-controls="mainnav">Menu</button>
</div></header>
<main id="main">
${body}
</main>
${footer}
<script src="/assets/config.js?v=${BUILD_DATE}"></script>
<script src="/assets/main.js?v=${BUILD_DATE}" defer></script>
</body>
</html>`;
}

const crumbsHTML = (items) => `<nav class="crumbs" aria-label="Breadcrumb">${items.map((it, i) => (i < items.length - 1 ? `<a href="${it[1]}">${esc(it[0])}</a><span aria-hidden="true">/</span>` : `<span aria-current="page">${esc(it[0])}</span>`)).join("")}</nav>`;
const crumbsLD = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it[0], item: SITE + it[1] })) });
const pageHead = (crumbs, h1, sub, extra = "") => `
<section class="page-head"><svg class="hero-mark" viewBox="5 2 52 63" aria-hidden="true"><use href="#horse"/></svg>
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
  <a class="thumb" href="/blog/${p.slug}/" aria-label="${esc(p.h1)}">${coverImg(p) || '<svg viewBox="5 2 52 63" aria-hidden="true"><use href="#horse"/></svg>'}</a>
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
  const lead = posts[0], rest = posts.slice(1);
  const body = `
<section class="hero"><svg class="hero-mark" viewBox="5 2 52 63" aria-hidden="true"><use href="#horse"/></svg>
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
      <a class="img" href="/blog/${lead.slug}/" style="display:grid;place-items:center" aria-label="${esc(lead.h1)}">${coverImg(lead, true) || '<svg viewBox="5 2 52 63" width="34%" style="color:#fff" aria-hidden="true"><use href="#horse"/></svg>'}</a>
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
  <div class="cats">${CATS.filter(c => counts[c.id]).slice(0, 7).map(c => `<a class="cat" href="/directory/?cat=${c.id}"><svg viewBox="5 2 52 63"><use href="#horse"/></svg><div><strong>${c.label}</strong><span>${counts[c.id]} places</span></div></a>`).join("")}<a class="cat" href="/add-your-business/"><svg viewBox="5 2 52 63"><use href="#horse"/></svg><div><strong>Add your business</strong><span>Free listing</span></div></a></div>
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
      <p class="advert-note">Local business? Reach Wellington residents with sponsored listings, newsletter placements and neighborhood sponsorships. <a href="/advertise/">See advertising options</a></p>
    </div>
  </div>
</div></section>
<div class="wrap">${sponsor()}</div>
${newsletter}`;
  add("/", layout({
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
for (const p of places) {
  const crumbs = [["Home", "/"], [catLabel(p.cat), p.cat === "restaurants" ? "/restaurants/" : `/directory/?cat=${p.cat}`], [p.name, `/places/${p.slug}/`]];
  const related = places.filter(x => x.cat === p.cat && x.slug !== p.slug).slice(0, 3);
  const street = p.address && /^\d/.test(p.address) ? p.address : "";
  const addrParts = street.match(/^(.*),\s*([^,]+),\s*FL\s*(\d{5})$/);
  const ldPlace = {
    "@context": "https://schema.org", "@type": p.schema || "LocalBusiness", name: p.name, description: p.desc, url: `${SITE}/places/${p.slug}/`,
    ...(addrParts ? { address: { "@type": "PostalAddress", streetAddress: addrParts[1], addressLocality: addrParts[2], addressRegion: "FL", postalCode: addrParts[3], addressCountry: "US" } } : { address: { "@type": "PostalAddress", addressLocality: (p.area || "").includes("nearby") ? undefined : "Wellington", addressRegion: "FL", addressCountry: "US" } }),
    ...(p.cuisine ? { servesCuisine: p.cuisine } : {}), ...(p.website ? { sameAs: [p.website] } : {})
  };
  const title = p.cat === "restaurants" ? `${p.name}, Wellington FL: ${p.type} Restaurant` : `${p.name} (${p.area && p.area.includes("nearby") ? p.address.split(",").slice(-2, -1)[0].trim() : "Wellington"}, FL): ${p.type} Guide`;
  const body = pageHead(crumbs, esc(p.name), esc(p.type) + (p.area ? " &middot; " + esc(p.area) : "")) + `<div class="wrap">${sponsor()}</div>
<div class="wrap place-grid">
  <article class="prose">
    <p class="lede">${esc(p.desc)}</p>
    ${p.tips && p.tips.length ? `<h2>Good to know</h2><ul class="tips">${p.tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    ${p.link ? `<p><a href="${p.link}">Read our full guide</a></p>` : ""}
    <div class="claim">Is this your business? <a href="/add-your-business/?claim=${p.slug}">Claim this listing</a> to add photos, hours and a link to your website, or <a href="/add-your-business/?claim=${p.slug}">suggest an edit</a>.</div>
    ${related.length ? `<div class="related"><h2>More ${esc(catLabel(p.cat).toLowerCase())} in Wellington</h2><div class="listings" style="grid-template-columns:1fr">${related.map(listingCard).join("")}</div></div>` : ""}
  </article>
  <aside><div class="sticky-rail">
    <dl class="info-card">
      <dt>Category</dt><dd>${esc(catLabel(p.cat))}</dd>
      <dt>Type</dt><dd>${esc(p.type)}</dd>
      ${p.address ? `<dt>Address</dt><dd>${esc(p.address)}</dd>` : `<dt>Area</dt><dd>${esc(p.area || "Wellington, FL")}</dd>`}
      ${p.phone ? `<dt>Phone</dt><dd>${esc(p.phone)}</dd>` : ""}
      ${p.website ? `<dt>Website</dt><dd><a href="${esc(p.website)}" rel="noopener nofollow" target="_blank">Visit website</a></dd>` : ""}
      <dd><a class="btn btn-primary" href="${mapsLink(p)}" rel="noopener" target="_blank">Get directions</a></dd>
    </dl>
    ${sponsor("rect")}
  </div></aside>
</div>
<div class="wrap">${sponsor()}</div>${newsletter}`;
  add(`/places/${p.slug}/`, layout({ title, description: p.desc.slice(0, 155).replace(/\s+\S*$/, "") + ".", urlPath: `/places/${p.slug}/`, body, jsonld: [crumbsLD(crumbs), ldPlace] }), "0.6");
}

// ---------- Events ----------
{
  const crumbs = [["Home", "/"], ["Events", "/events/"]];
  const evLD = events.map(e => ({ "@context": "https://schema.org", "@type": "Event", name: e.title, startDate: e.start, endDate: e.end || e.start, eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode", description: e.desc,
    location: { "@type": "Place", name: e.venue, address: e.address || "Wellington, FL" }, ...(e.url ? { url: e.url } : {}) }));
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
    const others = posts.filter(x => x.slug !== p.slug);
    const body = pageHead(crumbsP, esc(p.h1), "", `<div class="article-meta"><span>By Wellington List staff</span><span>Published <time datetime="${p.published}">${fmtDate(p.published)}</time></span>${p.updated !== p.published ? `<span>Updated <time datetime="${p.updated}">${fmtDate(p.updated)}</time></span>` : ""}<span>${p.readMins} min read</span></div>`) + `<div class="wrap">${sponsor()}</div>
<div class="wrap body-grid">
  <article class="prose">
    ${coverFile(p) ? `<figure class="cover">${coverImg(p, true)}</figure>` : ""}
    ${content}
    <section class="faq" id="faq"><h2>Frequently asked questions</h2>${p.faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</section>
    <section class="sources"><h2 style="font-size:20px">Sources</h2><ul>${p.sources.map(s => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.name)}</a></li>`).join("")}</ul>
    <p>Details on developments and schools can change. We update this guide as new information is announced. Spot something out of date? <a href="/submit-event/">Send us a tip</a>.</p></section>
    <div class="author-box"><span class="logo-tile"><svg width="30" height="38"><use href="#horse"/></svg></span><span>Written by the Wellington List team, an independent local guide covering Wellington, Florida.</span></div>
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
    add(urlPath, layout({ title: p.seoTitle, description: p.description, urlPath, body, jsonld: ld, ogType: "article", article: p, image: coverFile(p) }), "0.8", p.updated);
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
  const body = pageHead(crumbs, "Advertise on Wellington List", "Put your business in front of Wellington residents, homeowners and families every day.") + `
<div class="wrap" style="padding:44px 0">
  <div class="prose prose-narrow"><p class="lede">Wellington List is the independent local guide built for Wellington, Florida. Sponsors get premium, clearly labeled placements next to the local news, restaurant guides and directory pages residents use to make decisions.</p></div>
  <div class="tiers">
    <div class="tier"><span class="cat-label">Directory</span><h3>Featured listing</h3><ul><li>Top placement in your category</li><li>"Sponsored" badge and expanded listing</li><li>Photos, hours and website link</li></ul></div>
    <div class="tier best"><span class="cat-label">Most popular</span><h3>Site sponsor</h3><ul><li>Banner placements at the top and bottom of pages</li><li>Sidebar placement on news articles</li><li>Monthly newsletter mention</li></ul></div>
    <div class="tier"><span class="cat-label">Category</span><h3>Exclusive sponsorship</h3><ul><li>Own a category such as real estate or restaurants</li><li>"Featured agent" or "Presented by" placement</li><li>Limited to one business per category</li></ul></div>
  </div>
  <h2 class="prose" style="font-family:var(--serif);font-weight:500;font-size:30px">Request a media kit</h2>
  <form class="form" data-wl-form="Advertisers" data-success="Thanks! We'll be in touch with rates and availability.">
    <div class="row"><label>Your name<input name="name" required autocomplete="name"></label><label>Business<input name="business_name" required></label></div>
    <div class="row"><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Phone<input name="phone" type="tel" autocomplete="tel"></label></div>
    <label>Interested in<select name="interest"><option>Site sponsor</option><option>Featured listing</option><option>Exclusive category sponsorship</option><option>Newsletter</option><option>Not sure yet</option></select></label>
    <label>Anything else?<textarea name="message"></textarea></label>
    ${hp}<button class="btn btn-primary" type="submit">Request media kit</button><div class="status" role="status"></div>
  </form>
</div>`;
  add("/advertise/", layout({ title: "Advertise in Wellington, FL | Wellington List Sponsorships", description: "Reach Wellington, Florida residents with sponsored listings, banner placements, newsletter mentions and exclusive category sponsorships on Wellington List.", urlPath: "/advertise/", body, jsonld: [crumbsLD(crumbs)] }), "0.6");
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
    <p>Wellington List is independent and is not affiliated with the Village of Wellington.</p></div></div>`, jsonld: [crumbsLD(crumbs)] }), "0.4");
}
{
  const crumbs = [["Home", "/"], ["Privacy", "/privacy/"]];
  add("/privacy/", layout({ title: "Privacy Policy | Wellington List", description: "How Wellington List handles information submitted through our forms and analytics.", urlPath: "/privacy/",
    body: pageHead(crumbs, "Privacy policy", "") + `<div class="wrap" style="padding:44px 0"><div class="prose prose-narrow">
    <p>Last updated ${fmtDate(BUILD_DATE)}.</p>
    <h2>What we collect</h2><p>When you submit a form (newsletter, business listing, event or advertising inquiry), we collect the information you enter so we can respond, publish your listing or event, or send the newsletter you asked for. We may use privacy-respecting analytics to understand which pages are popular.</p>
    <h2>What we publish</h2><p>Business and event details you submit for publication may appear on the site. Your email address is never published.</p>
    <h2>What we never do</h2><p>We do not sell your personal information. You can unsubscribe from emails at any time.</p>
    <h2>Questions</h2><p>Contact us through our <a href="/submit-event/">contact form</a>.</p></div></div>`, jsonld: [crumbsLD(crumbs)] }), "0.2");
}
write("404.html", layout({ title: "Page not found | Wellington List", description: "This page could not be found.", urlPath: "/404.html", noindex: true,
  body: pageHead([["Home", "/"], ["Not found", "/404.html"]], "We couldn't find that page", "Try the directory, the latest news, or head back home.") + `<div class="wrap" style="padding:44px 0;display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn-primary" href="/">Home</a><a class="btn btn-ghost" href="/directory/">Directory</a><a class="btn btn-ghost" href="/blog/">News</a></div>` }));

// ---------- Assets, sitemap, robots, feed ----------
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
fs.writeFileSync(path.join(OUT, "assets/site.css"), read("assets/base.css") + read("assets/extra.css") + "\n.foot-h{font-size:14px;color:#fff;margin:0 0 14px;font-weight:600;font-family:var(--sans)}\n.h4{font-family:var(--serif);font-weight:500;font-size:22px;margin:2px 0 0;line-height:1.2}\n");
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
