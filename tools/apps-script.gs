/**
 * WellingtonList.com form receiver + Claude review (Google Apps Script).
 *
 * Where submissions live: a Google Sheet ("WellingtonList Submissions"), one tab per form:
 * Businesses, Events, Advertisers.
 *
 * What happens on each submission:
 * 1. The row is saved to the right tab.
 * 2. Business and event submissions are reviewed by Claude (with web search) to check they are real,
 *    in or near Wellington, FL, and not spam. Claude writes "yes", "no" or "review" in the Approved column
 *    and a short reason in the ai_review column.
 * 3. You get an email for anything marked "review" or "no" (and for every advertiser inquiry).
 * 4. Every morning the GitHub Action publishes rows with Approved = yes. You can override any row by hand.
 *
 * Setup:
 * - Extensions > Apps Script, paste this file, save.
 * - Project Settings > Script properties: add ANTHROPIC_API_KEY (and optionally NOTIFY_EMAIL).
 * - Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Copy the URL into assets/config.js (formEndpoint).
 * - File > Share > Publish to web: publish the Businesses and Events tabs as CSV and save those links as
 *   GitHub repo variables SHEET_BUSINESSES_CSV and SHEET_EVENTS_CSV.
 */
var MODEL = "claude-sonnet-5-5";
var HEADERS = {
  Businesses: ["timestamp","approved","ai_review","business_name","category","subcategory","address","phone","website","description","email","claim_listing","interested_in_featured","page"],
  Events: ["timestamp","approved","ai_review","event_name","start_date","end_date","start_time","venue","address","link","description","email","page"],
  Advertisers: ["timestamp","approved","ai_review","name","business_name","email","phone","interest","message","page"]
};

/** Run once: creates the tabs, headers and the public (approved-only, no emails) tabs used by the website. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.rename("WellingtonList Submissions");
  Object.keys(HEADERS).forEach(function (t) {
    var sh = ss.getSheetByName(t) || ss.insertSheet(t);
    sh.getRange(1, 1, 1, HEADERS[t].length).setValues([HEADERS[t]]).setFontWeight("bold");
    sh.setFrozenRows(1);
  });
  var pub = { "Businesses Public": "=QUERY(Businesses!A:J,\"select D,E,F,G,H,I,J,B where B = 'yes'\",1)",
              "Events Public": "=QUERY(Events!A:K,\"select D,E,F,G,H,I,J,K,B where B = 'yes'\",1)" };
  Object.keys(pub).forEach(function (t) {
    var sh = ss.getSheetByName(t) || ss.insertSheet(t);
    sh.getRange("A1").setFormula(pub[t]);
  });
  var s1 = ss.getSheetByName("Sheet1"); if (s1 && ss.getSheets().length > 1) ss.deleteSheet(s1);
}

function doPost(e) {
  var p = e.parameter || {};
  if (p.website_url_hp) return ContentService.createTextOutput("ok"); // spam trap
  var tab = (p.form_type || "Other").replace(/[^A-Za-z ]/g, "");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
  var keys = Object.keys(p).filter(function (k) { return k !== "form_type" && k !== "website_url_hp"; });
  var header = sh.getLastRow() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  if (!header.length) { header = ["timestamp", "approved", "ai_review"].concat(keys); sh.appendRow(header); }
  keys.concat(["ai_review"]).forEach(function (k) { if (header.indexOf(k) === -1) { header.push(k); sh.getRange(1, header.length).setValue(k); } });
  var row = header.map(function (h) { var v = p[h] || ""; if (/_date$/.test(h) && v) v = "'" + v; return h === "timestamp" ? new Date() : (h === "approved" || h === "ai_review") ? "" : v; });
  sh.appendRow(row);
  var r = sh.getLastRow();

  var verdict = { decision: "review", reason: "Not auto-reviewed" };
  if (tab === "Businesses" || tab === "Events") {
    try { verdict = review(tab, p); } catch (err) { verdict = { decision: "review", reason: "Review failed: " + err }; }
    sh.getRange(r, header.indexOf("approved") + 1).setValue(verdict.decision);
    sh.getRange(r, header.indexOf("ai_review") + 1).setValue(verdict.reason);
  }
  if (tab === "Advertisers" || verdict.decision !== "yes") notify(tab, p, verdict);
  return ContentService.createTextOutput("ok");
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
  try { MailApp.sendEmail(to, "WellingtonList " + tab + ": " + v.decision, v.reason + "\n\n" + JSON.stringify(p, null, 2)); } catch (err) {}
}
