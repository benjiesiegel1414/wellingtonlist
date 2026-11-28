/**
 * WellingtonList.com form receiver + review (Google Apps Script project "WellingtonList Forms",
 * writing to the "WellingtonList Submissions" Google Sheet below).
 *
 * Tabs:
 * - Businesses: free listings from /add-your-business/. Reviewed by Claude (with web search) to check they are real,
 *   in or near Wellington, FL, and not spam. Claude writes "yes", "no" or "review" in the approved column.
 * - Featured: paid listing details from /featured/setup/ (after Stripe checkout), with logo and up to 10 photos saved
 *   to the "WellingtonList Featured Uploads" Google Drive folder. Auto-approved (approved = yes) when they came from a
 *   real Stripe checkout link, the checkout ID hasn't been used before and the content passes basic checks. Each one
 *   emails you so you can match it to the payment in Stripe. (Optional: add a STRIPE_SECRET_KEY script property, a
 *   restricted key with read access to Checkout Sessions, and the payment itself is verified with Stripe too.)
 * - Events: event submissions from /submit-event/ (reviewed by Claude, same as businesses).
 * - Advertisers: older advertiser inquiries.
 * - "Businesses Public", "Featured Public", "Events Public": approved rows only, no emails. Published to the web as CSV
 *   for the site (GitHub repo variables SHEET_BUSINESSES_CSV, SHEET_FEATURED_CSV, SHEET_EVENTS_CSV).
 * - You get an email for anything not approved, every advertiser inquiry and every Featured listing.
 * - The GitHub Action rebuilds the site about every 15 minutes and publishes rows with approved = yes.
 *   You can override any row by hand.
 *
 * Setup: paste this file into the Apps Script project, save, run setupFeatured() once (it only adds what's missing),
 * then Deploy > Manage deployments > edit the web app > New version (keeps the same URL).
 * Script properties: ANTHROPIC_API_KEY (and optionally NOTIFY_EMAIL, STRIPE_SECRET_KEY).
 */
var MODEL = "claude-sonnet-5-5";
var SHEET_ID = "1HZsAqwY86zbEXJ3MtVRioDbuuLsHqOMoxJa6L5udJZs";
var HEADERS = {
  Businesses: ["timestamp","approved","ai_review","business_name","category","subcategory","address","phone","website","description","email","claim_listing","interested_in_featured","page","hours","contact_name"],
  Featured: ["timestamp","approved","ai_review","plan","session_id","business_name","category","subcategory","address","phone","website","hours","description","deals","booking_url","facebook","instagram","mention_in","existing_listing","contact_name","email","logo_id","photo_ids","page"],
  Events: ["timestamp","approved","ai_review","event_name","start_date","end_date","start_time","venue","address","link","description","email","page"],
  Advertisers: ["timestamp","approved","ai_review","name","business_name","email","phone","interest","message","page"]
};
// Public columns (by header name) for each published tab. Never include email or contact_name.
var PUBLIC = {
  "Businesses Public": ["Businesses", ["business_name","category","subcategory","address","phone","website","description","hours","approved"]],
  "Featured Public": ["Featured", ["business_name","category","subcategory","address","phone","website","hours","description","deals","booking_url","facebook","instagram","mention_in","existing_listing","logo_id","photo_ids","plan","approved"]]
};
// Featured listings: roughly 50 miles around Wellington (Palm Beach, Broward, Martin and St. Lucie), by ZIP prefix.
var LOCAL_ZIP_PREFIXES = ["330", "331", "333", "334", "349"];
function inServiceArea_(zip) { return !!zip && LOCAL_ZIP_PREFIXES.indexOf(zip.slice(0, 3)) > -1; }
var BANNED = /\b(casino|gambl\w*|porn\w*|escorts?|xxx|viagra|cialis|onlyfans|payday loans?|crypto giveaway|forex signals?|bitcoin double|weed delivery|hookups?|adult massage|happy ending|body rub|replica watch\w*|essay writing|seo backlinks? package|sex|sexy|nude|nudes|naked|erotic\w*|fetish\w*|nsfw|strip club|gentlem[ae]n'?s club|sugar daddy|cam girls?|f+u+c+k\w*|shit\w*|bitch\w*|nazi\w*|guns? for sale|ammo for sale)\b/i;

function colLetter_(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

/** Run once (safe to re-run): adds the Featured tab, any missing columns, the public tabs and the Drive photo folder. Never deletes or reorders data. */
function setupFeatured() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  Object.keys(HEADERS).forEach(function (t) {
    var sh = ss.getSheetByName(t);
    if (!sh) { sh = ss.insertSheet(t); sh.getRange(1, 1, 1, HEADERS[t].length).setValues([HEADERS[t]]).setFontWeight("bold"); sh.setFrozenRows(1); return; }
    var header = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    HEADERS[t].forEach(function (h) { if (header.indexOf(h) === -1) { header.push(h); sh.getRange(1, header.length).setValue(h).setFontWeight("bold"); } });
  });
  Object.keys(PUBLIC).forEach(function (name) {
    var src = PUBLIC[name][0], cols = PUBLIC[name][1];
    var header = ss.getSheetByName(src).getRange(1, 1, 1, ss.getSheetByName(src).getLastColumn()).getValues()[0];
    var letters = cols.map(function (c) { return colLetter_(header.indexOf(c) + 1); });
    var approved = colLetter_(header.indexOf("approved") + 1);
    var formula = "=QUERY(" + src + "!A:" + colLetter_(header.length) + ",\"select " + letters.join(",") + " where " + approved + " = 'yes'\",1)";
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange("A1").setFormula(formula);
  });
  photoFolder_();
}

function doGet() { return ContentService.createTextOutput("WellingtonList form endpoint is running."); }

function doPost(e) {
  var p = {};
  if (e.postData && e.postData.type && e.postData.type.indexOf("text/plain") === 0) {
    try { p = JSON.parse(e.postData.contents); } catch (err) { p = {}; }
  } else { p = e.parameter || {}; }
  if (p.website_url_hp) return out_("ok"); // spam trap
  var tab = String(p.form_type || "Other").replace(/[^A-Za-z ]/g, "");
  if (tab === "Featured") return saveFeatured_(p);

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
  var keys = Object.keys(p).filter(function (k) { return k !== "form_type" && k !== "website_url_hp"; });
  var header = sh.getLastRow() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  if (!header.length) { header = ["timestamp", "approved", "ai_review"].concat(keys); sh.appendRow(header); }
  keys.concat(["ai_review"]).forEach(function (k) { if (header.indexOf(k) === -1) { header.push(k); sh.getRange(1, header.length).setValue(k); } });
  var row = header.map(function (h) {
    var v = p[h] || ""; v = String(v).slice(0, 5000);
    if (/^[=+\-@]/.test(v)) v = "'" + v; // never let a submission run as a formula
    if (/_date$/.test(h) && v) v = "'" + v;
    return h === "timestamp" ? new Date() : (h === "approved" || h === "ai_review") ? "" : v;
  });
  sh.appendRow(row);
  var r = sh.getLastRow();

  var verdict = { decision: "review", reason: "Not auto-reviewed" };
  if (tab === "Businesses" || tab === "Events") {
    try { verdict = review(tab, p); } catch (err) { verdict = { decision: "review", reason: "Review failed: " + err }; }
    sh.getRange(r, header.indexOf("approved") + 1).setValue(verdict.decision);
    sh.getRange(r, header.indexOf("ai_review") + 1).setValue(verdict.reason);
  }
  if (tab === "Advertisers" || verdict.decision !== "yes") notify(tab, p, verdict);
  return out_("ok");
}

// Paid Featured listing from /featured/setup/: save photos to Drive, check it, record it, email the owner.
function saveFeatured_(p) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName("Featured");
    if (!sh) { setupFeatured(); sh = ss.getSheetByName("Featured"); }
    var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    // Repeat clicks: the same Stripe checkout for the same business is recorded and emailed once.
    if (p.session_id && columnHas_(sh, header, "session_id", p.session_id) && columnHas_(sh, header, "business_name", p.business_name)) return out_("ok");

    var folder = photoFolder_().createFolder(String(p.business_name || "Business").slice(0, 60) + " " + Utilities.formatDate(new Date(), "America/New_York", "yyyy-MM-dd HHmm"));
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    p.logo_id = p.logo ? saveImage_(folder, p.logo, "logo") : "";
    var ids = [];
    (p.photos || []).slice(0, 10).forEach(function (d, i) { var id = saveImage_(folder, d, "photo-" + (i + 1)); if (id) ids.push(id); });
    p.photo_ids = ids.join(",");
    delete p.logo; delete p.photos;

    var verdict = checkFeatured_(p, sh, header);
    var row = header.map(function (h) {
      if (h === "timestamp") return new Date();
      if (h === "approved") return verdict.decision;
      if (h === "ai_review") return verdict.reason;
      var v = p[h]; if (Array.isArray(v)) v = v.join(", ");
      v = v == null ? "" : String(v).slice(0, 5000);
      if (/^[=+\-@]/.test(v)) v = "'" + v;
      return v;
    });
    sh.appendRow(row);
    notify("Featured", p, verdict);
  } finally { lock.releaseLock(); }
  return out_("ok");
}

function columnHas_(sh, header, col, value) {
  var i = header.indexOf(col);
  if (i < 0 || sh.getLastRow() < 2 || !value) return false;
  return sh.getRange(2, i + 1, sh.getLastRow() - 1, 1).getValues().some(function (r) { return String(r[0]).toLowerCase().trim() === String(value).toLowerCase().trim(); });
}

// Basic content checks for Featured listings. Returns a list of problems (empty = clean).
function contentProblems_(p, minWords, maxWords) {
  var problems = [];
  var name = String(p.business_name || "").trim();
  var desc = String(p.description || "").trim();
  var words = desc ? desc.split(/\s+/).length : 0;
  var digits = String(p.phone || "").replace(/\D/g, "").replace(/^1/, "");
  var zip = (String(p.address || "").match(/\b(\d{5})\b(?!.*\b\d{5}\b)/) || [])[1];
  if (name.length < 2 || name.length > 80) problems.push("business name missing or too long");
  if (!p.address || !/\bFL\b|Florida/i.test(p.address)) problems.push("address is not in Florida");
  else if (!inServiceArea_(zip)) problems.push("ZIP " + (zip || "missing") + " is more than about 50 miles from Wellington");
  if (digits.length !== 10) problems.push("phone number is not a 10-digit US number");
  if (words < minWords) problems.push("description is under " + minWords + " words");
  if (words > maxWords) problems.push("description is over " + maxWords + " words");
  if ((desc.match(/https?:\/\//g) || []).length > 1) problems.push("description contains links");
  var allText = [name, desc, p.subcategory, p.deals, p.mention_in, p.website, p.booking_url, p.facebook, p.instagram].join(" ");
  if (BANNED.test(allText)) problems.push("contains blocked words (" + (allText.match(BANNED) || [""])[0] + ")");
  ["website", "booking_url", "facebook", "instagram"].forEach(function (k) {
    if (p[k] && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(p[k])) problems.push(k + " is not a valid URL");
  });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email || "")) problems.push("contact email is not valid");
  if (/[A-Z]{12,}/.test(desc) || /(.)\1{6,}/.test(desc)) problems.push("description looks like spam");
  return problems;
}

function checkFeatured_(p, sh, header) {
  var problems = contentProblems_(p, 25, 650);
  var sid = String(p.session_id || "");
  if (!/^cs_live_[A-Za-z0-9]{20,}$/.test(sid)) problems.push("no real Stripe checkout ID (did not come from a paid checkout)");
  else if (columnHas_(sh, header, "session_id", sid)) problems.push("this Stripe checkout was already used for another listing");
  var key = PropertiesService.getScriptProperties().getProperty("STRIPE_SECRET_KEY");
  if (key && !problems.length) {
    try {
      var res = UrlFetchApp.fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sid), { headers: { Authorization: "Bearer " + key }, muteHttpExceptions: true });
      var s = JSON.parse(res.getContentText());
      if (s.payment_status === "paid" || s.status === "complete") return { decision: "yes", reason: "Stripe payment confirmed (" + (s.amount_total / 100) + " " + String(s.currency).toUpperCase() + "); passed all checks" };
      problems.push("Stripe says not paid: " + (s.payment_status || (s.error && s.error.message)));
    } catch (err) { problems.push("Stripe check failed: " + err); }
  }
  if (problems.length) return { decision: "review", reason: problems.join("; ") };
  return { decision: "yes", reason: "Auto-approved: came from a Stripe checkout and passed all checks. Match it to the " + (p.plan || "") + " payment from " + (p.email || "?") + " in Stripe" };
}

function saveImage_(folder, dataUrl, name) {
  var m = String(dataUrl).match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) return "";
  var bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > 4 * 1024 * 1024) return "";
  var file = folder.createFile(Utilities.newBlob(bytes, m[1], name + "." + (m[2] === "jpeg" ? "jpg" : m[2])));
  return file.getId();
}

function photoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("PHOTO_FOLDER_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder("WellingtonList Featured Uploads");
  props.setProperty("PHOTO_FOLDER_ID", f.getId());
  return f;
}

function review(tab, p) {
  var key = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!key) return { decision: "review", reason: "No ANTHROPIC_API_KEY set" };
  var rules = tab === "Businesses"
    ? "Approve only if this is a real, currently operating business located in or serving Wellington, Florida or the immediate western Palm Beach County area (Royal Palm Beach, Loxahatchee, Lake Worth west). Reject spam, adult content, illegal services, obvious fakes, MLM recruiting, or businesses far from Wellington."
    : "Approve only if this is a real, upcoming, family-appropriate event taking place in or near Wellington, Florida. Reject spam, past events, adult content, scams or events far from Wellington.";
  var prompt = "You moderate submissions for WellingtonList.com, a local directory for Wellington, FL.\n" + rules +
    "\nUse web search to verify when helpful. If you cannot verify but nothing looks wrong, answer review.\n" +
    "Submission:\n" + JSON.stringify(p, null, 2) +
    "\n\nReply with ONLY a JSON object: {\"decision\":\"yes\"|\"no\"|\"review\",\"reason\":\"one short sentence\"}";
  var res = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    payload: JSON.stringify({ model: MODEL, max_tokens: 800,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: prompt }] })
  });
  var data = JSON.parse(res.getContentText());
  var text = (data.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("");
  var m = text.match(/\{[\s\S]*\}/);
  var v = m ? JSON.parse(m[0]) : { decision: "review", reason: "Unreadable response" };
  if (["yes", "no", "review"].indexOf(v.decision) === -1) v.decision = "review";
  return v;
}

function notify(tab, p, v) {
  var to = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL") || Session.getActiveUser().getEmail();
  var subject = tab === "Featured"
    ? "New WellingtonList FEATURED listing (" + (p.plan || "") + "): " + (p.business_name || "") + (v.decision === "yes" ? " [auto-approved, live within the hour]" : " [needs review]")
    : "WellingtonList " + tab + ": " + v.decision;
  var lines = ["Status: " + v.decision, "Notes: " + v.reason, ""];
  Object.keys(p).forEach(function (k) { if (k !== "form_type") lines.push(k + ": " + p[k]); });
  lines.push("", "Open the sheet: https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/edit");
  try { MailApp.sendEmail(to, subject, lines.join("\n")); } catch (err) {}
}

function out_(t) { return ContentService.createTextOutput(t); }
