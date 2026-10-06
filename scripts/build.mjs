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
const horseSymbol = read("assets/horse-symbol.svg");
const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${horseSymbol}</svg>`;
const logo = (light) => `<a class="brand" href="/" aria-label="Wellington List home"><span class="logo-tile${light ? " logo-tile-light" : ""}"><svg width="30" height="38"><use href="#horse"/></svg></span><span class="brand-name">Wellington List<span>Wellington, Florida</span></span></a>`;

const NAV = [["/blog/", "News"], ["/directory/", "Directory"], ["/restaurants/", "Eat and Drink"], ["/services/", "Services"], ["/things-to-do/", "Things to Do"], ["/events/", "Events"], ["/equestrian/", "Equestrian"]];

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
    <div class="legal"><span>&copy; <span id="yr">${new Date().getFullYear()}</span> Wellington List. Independent and not affiliated with the Village of Wellington.</span><span><a href="mailto:hello@wellingtonlist.com">hello@wellingtonlist.com</a> &nbsp; <a href="/privacy/">Privacy</a> &nbsp; <a href="/about/">About</a></span></div>
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


const SERVICE_PAGES = [
  { slug: "plumbers", noun: "Plumbers", re: /plumb|rooter/i, blurb: "drain cleaning, leaks, water heaters, backflow testing and emergency repairs", tips: ["Confirm the plumber is licensed in Florida and carries insurance", "Ask whether they charge a trip fee and whether emergency or after-hours rates apply", "For older Wellington homes, ask about repiping and water heater replacement options"] },
  { slug: "ac-repair", noun: "AC Repair Companies", re: /\bac\b|air condition|hvac|duct/i, blurb: "AC repair, new system installation, duct cleaning and maintenance plans", tips: ["Book maintenance in spring before the summer rush", "Ask about maintenance plans, which often include priority service", "Get a written quote and ask about SEER ratings and FPL rebates on new systems"] },
  { slug: "roofers", noun: "Roofers", re: /roof/i, blurb: "tile, shingle and metal roofs, repairs, replacements and storm damage", tips: ["Check the contractor's Florida roofing license and insurance", "Ask who handles the permit and your HOA approval", "Get photos of any damage and a written scope before work starts, especially for insurance claims"] },
  { slug: "pest-control", noun: "Pest Control Companies", re: /pest|critter|wildlife/i, blurb: "ants, termites, roaches, rodents, mosquitoes and wildlife removal", tips: ["Ask whether treatments are pet and child friendly", "Compare one-time treatments with quarterly plans", "Termite inspections are worth scheduling before buying a home"] },
  { slug: "electricians", noun: "Electricians", re: /electric/i, blurb: "electrical repairs, panel upgrades, lighting, generators and EV chargers", tips: ["Hire a licensed Florida electrical contractor for anything beyond basic fixtures", "Ask about whole-home generators and surge protection before hurricane season", "Get permits pulled for panel upgrades and new circuits"] },
  { slug: "pool-service", noun: "Pool Service Companies", re: /pool/i, blurb: "weekly pool cleaning, equipment repair, pool resurfacing, supplies and renovations", tips: ["Ask what weekly service includes, such as chemicals and filter cleaning", "Get equipment checked before summer", "Ask about storm prep for pools during hurricane season", "Pool resurfacing (plaster, pebble or quartz finishes) is typically needed every 10 to 15 years; get at least two quotes and ask about tile and coping work at the same time"] },
  { slug: "landscaping", noun: "Landscaping and Lawn Care Companies", re: /landscap|lawn/i, blurb: "lawn mowing, landscape design, tree and palm trimming and irrigation", tips: ["Check your HOA's landscaping rules before major changes", "Ask about irrigation checks, especially during the dry season", "Schedule tree and palm trimming before hurricane season"] },
  { slug: "dentists", noun: "Dentists", re: /dent|orthodont|endodont/i, blurb: "family, pediatric and cosmetic dentistry, orthodontics and root canals", tips: ["Call ahead to confirm your dental insurance is accepted", "Ask about new patient specials and emergency appointments", "Pediatric dentists are a good first stop for young kids"] },
  { slug: "doctors-urgent-care", noun: "Doctors, Hospitals and Urgent Care", re: /hospital|urgent|pediatrician|pediatric care|pediatrics|imaging|medical center/i, cats: ["health"], blurb: "hospitals, urgent care, pediatricians and diagnostic imaging", tips: ["For emergencies, call 911 or go to the nearest emergency room", "Urgent care is a good option for minor injuries and illnesses after hours", "Confirm insurance acceptance before your visit"] },
  { slug: "pediatricians", noun: "Pediatricians", re: /pediatrician/i, cats: ["health"], blurb: "well-child visits, vaccines, sick visits and sports physicals for babies, kids and teens", tips: ["Call ahead to confirm the practice is accepting new patients and takes your insurance", "Ask about same-day sick visits and after-hours phone lines", "Schedule back-to-school and sports physicals early in the summer", "For after-hours illness, Wellington has several urgent care centers; for emergencies call 911"] },
  { slug: "veterinarians", noun: "Veterinarians", re: /veterin|vet\b|animal/i, cats: ["pets", "equestrian"], blurb: "vets, animal hospitals and equine care", tips: ["Ask about after-hours and emergency options", "Bring vaccination and medical records to your first visit", "Wellington horse owners should keep an equine vet's number handy"] },
  { slug: "real-estate-agents", noun: "Real Estate Agents", re: /real estate|realty/i, blurb: "agents and brokerages who know Wellington neighborhoods, equestrian properties and seasonal rentals", tips: ["Ask which Wellington communities the agent knows best", "Equestrian and seasonal rental properties often need a specialist", "Ask for recent comparable sales before pricing or making an offer"] },
  { slug: "insurance-agents", noun: "Insurance Agents", re: /insurance/i, blurb: "home, auto, flood, life and business insurance agents", tips: ["Compare quotes from more than one agent, since Florida home insurance rates vary widely", "Ask about wind mitigation inspections, which can lower premiums", "Review your flood and hurricane coverage before June 1"] },
  { slug: "auto-repair", noun: "Auto Repair Shops and Tire Stores", re: /auto|tire|car dealer/i, blurb: "auto repair, tires, maintenance and dealer service", tips: ["Ask for a written estimate before repairs begin", "Ask whether the shop works on your make, including classic or European cars", "Horse trailer owners should ask about trailer repair and maintenance"] },
  { slug: "gyms", noun: "Gyms and Fitness Studios", re: /gym|fitness|pilates|kickbox|wellness/i, blurb: "gyms, Pilates, kickboxing and boutique fitness studios", tips: ["Most gyms offer a free trial class or day pass", "Ask about contract length and cancellation terms", "Season brings more crowds, so check off-peak hours"] },
  { slug: "hair-salons", noun: "Hair Salons", re: /hair|salon suites|beauty salon/i, blurb: "haircuts, color, styling and blowouts", tips: ["Book color and big appointments a few weeks ahead in season", "Ask for a consultation before major color changes", "Salon suites are a good way to find independent stylists"] },
  { slug: "nail-salons", noun: "Nail Salons", re: /nail/i, blurb: "manicures, pedicures, gel and lashes", tips: ["Walk-ins are easier on weekday mornings", "Ask about sanitation practices and tool sterilization", "Book ahead before holidays and events"] },
  { slug: "med-spas", noun: "Med Spas and Beauty Spas", re: /med spa|beauty spa/i, blurb: "facials, injectables, laser treatments and skin care", tips: ["Ask who performs injectables and their credentials", "Book a consultation before committing to a treatment plan", "Ask about package pricing for laser treatments"] }
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
    { q: `Do these ${sp.noun.toLowerCase()} serve all of Wellington?`, a: `Most serve all Wellington ZIP codes, including 33414, 33449 and 33467, plus nearby Royal Palm Beach, Loxahatchee and Lake Worth. Call to confirm they cover your address.` }
  ];
  const intro = listIntro(`<p>Looking for the best ${sp.noun.toLowerCase()} in Wellington, Florida? Here are ${list.length} local providers for ${sp.blurb} in and around Wellington, with addresses and phone numbers where available.</p><h2 style="font-family:var(--serif);font-weight:500;font-size:24px;margin:22px 0 8px">Tips for hiring ${sp.noun.toLowerCase()} in Wellington</h2><ul>${sp.tips.map(t => `<li>${t}</li>`).join("")}</ul><p>Own one of these businesses? <a href="/add-your-business/">Claim or add your listing</a> for free. Want to be the featured provider on this page? <a href="/advertise/">See sponsorship options</a>.</p>`)
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
    <div class="tier best"><span class="cat-label">Most popular</span><h3>Site sponsor</h3><ul><li>Banner placements at the top and bottom of pages</li><li>Sidebar placement on news articles</li><li>Featured spot on the homepage</li></ul></div>
    <div class="tier"><span class="cat-label">Category</span><h3>Exclusive sponsorship</h3><ul><li>Own a category such as real estate or restaurants</li><li>"Featured agent" or "Presented by" placement</li><li>Limited to one business per category</li></ul></div>
  </div>
  <h2 class="prose" style="font-family:var(--serif);font-weight:500;font-size:30px">Request a media kit</h2>
  <p class="prose" style="margin:-6px 0 18px">Prefer email? Write to <a href="mailto:hello@wellingtonlist.com">hello@wellingtonlist.com</a>.</p>
  <form class="form" data-wl-form="Advertisers" data-success="Thanks! We'll be in touch with rates and availability.">
    <div class="row"><label>Your name<input name="name" required autocomplete="name"></label><label>Business<input name="business_name" required></label></div>
    <div class="row"><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Phone<input name="phone" type="tel" autocomplete="tel"></label></div>
    <label>Interested in<select name="interest"><option>Site sponsor</option><option>Featured listing</option><option>Exclusive category sponsorship</option><option>Newsletter</option><option>Not sure yet</option></select></label>
    <label>Anything else?<textarea name="message"></textarea></label>
    ${hp}<button class="btn btn-primary" type="submit">Request media kit</button><div class="status" role="status"></div>
  </form>
</div>`;
  add("/advertise/", layout({ title: "Advertise in Wellington, FL | Wellington List Sponsorships", description: "Reach Wellington, Florida residents with sponsored listings, banner placements, homepage placements and exclusive category sponsorships on Wellington List.", urlPath: "/advertise/", body, jsonld: [crumbsLD(crumbs)] }), "0.6");
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
    <p>Prefer email? Reach us anytime at <a href="mailto:hello@wellingtonlist.com">hello@wellingtonlist.com</a>.</p>
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
    <h2>Analytics and cookies</h2><p>We use Google Analytics to understand how visitors use the site, such as which pages are viewed, how long visits last, the general location (city or region) and the type of device and browser. Google Analytics uses cookies and similar technologies, and Google may process this data under its own privacy policy. We do not use this data to identify you personally. You can block cookies in your browser settings or use the <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener nofollow">Google Analytics opt-out browser add-on</a>. We do not sell your personal information and we do not use third-party advertising networks.</p>
    <h2>Sponsors and links</h2><p>Some placements on the site are paid sponsorships and are labeled as advertisements. This site links to other websites, including businesses we list. We are not responsible for the privacy practices of other sites.</p>
    <h2>How long we keep information</h2><p>We keep submissions as long as needed to operate the directory and respond to you. You can ask us to update or delete a listing or your submission at any time.</p>
    <h2>Children</h2><p>This site is intended for a general audience and is not directed to children under 13. We do not knowingly collect personal information from children.</p>
    <h2>Your choices and contact</h2><p>To correct or remove a listing, or to ask about the information we hold about you, email <a href="mailto:hello@wellingtonlist.com">hello@wellingtonlist.com</a>. We may update this policy from time to time, and the date at the top shows the latest version.</p></div></div>`, jsonld: [crumbsLD(crumbs)] }), "0.2");
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
