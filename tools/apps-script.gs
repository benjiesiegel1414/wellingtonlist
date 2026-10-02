/**
 * WellingtonList.com form receiver (Google Apps Script).
 * Setup (about 2 minutes):
 * 1. Create a Google Sheet named "WellingtonList Submissions".
 * 2. Extensions > Apps Script, paste this file, save.
 * 3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 * 4. Copy the web app URL into docs/assets/config.js (formEndpoint) and src/assets/config.js.
 * Every form creates/uses its own tab: Businesses, Events, Newsletter, Advertisers.
 * To publish a business or event, type "yes" in its Approved column.
 * Then File > Share > Publish to web > choose the Businesses tab > CSV, and do the same for Events.
 * Save those two CSV links as GitHub repository variables SHEET_BUSINESSES_CSV and SHEET_EVENTS_CSV.
 * The nightly GitHub Action adds approved rows to the site automatically.
 */
function doPost(e) {
  var p = e.parameter || {};
  if (p.website_url_hp) return ContentService.createTextOutput("ok"); // spam trap
  var tab = (p.form_type || "Other").replace(/[^A-Za-z ]/g, "");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
  var keys = Object.keys(p).filter(function (k) { return k !== "form_type" && k !== "website_url_hp"; });
  var header = sh.getLastRow() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  if (!header.length) { header = ["timestamp", "approved"].concat(keys); sh.appendRow(header); }
  keys.forEach(function (k) { if (header.indexOf(k) === -1) { header.push(k); sh.getRange(1, header.length).setValue(k); } });
  var row = header.map(function (h) { return h === "timestamp" ? new Date() : h === "approved" ? "" : (p[h] || ""); });
  sh.appendRow(row);
  try { MailApp.sendEmail(Session.getActiveUser().getEmail(), "New WellingtonList " + tab + " submission", JSON.stringify(p, null, 2)); } catch (err) {}
  return ContentService.createTextOutput("ok");
}
