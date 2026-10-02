// Generates the OG image and PNG icons from the SVG logo. Runs in GitHub Actions when images are missing.
import fs from "node:fs";
import { chromium } from "playwright";
const sym = fs.readFileSync("src/assets/horse-symbol.svg", "utf8");
const inner = sym.slice(sym.indexOf(">") + 1, sym.lastIndexOf("</symbol>")).replaceAll("currentColor", "#fff");
const mesh = "radial-gradient(55% 75% at 88% 12%, rgba(88,176,112,.55) 0%, rgba(88,176,112,0) 70%),radial-gradient(45% 60% at 62% 105%, rgba(210,112,42,.22) 0%, rgba(210,112,42,0) 70%),radial-gradient(60% 80% at 0% 100%, rgba(6,26,14,.85) 0%, rgba(6,26,14,0) 70%),linear-gradient(135deg,#12391F 0%,#1D5631 50%,#23653A 100%)";
const og = `<html><body style="margin:0"><div style="width:1200px;height:630px;position:relative;overflow:hidden;color:#fff;font-family:Georgia,serif;background:${mesh}">
<svg style="position:absolute;right:70px;top:70px" width="380" height="490" viewBox="5 2 52 63">${inner}</svg>
<div style="position:absolute;left:80px;top:150px;width:640px"><div style="font-size:92px;line-height:1">Wellington List</div>
<div style="font-family:Arial,sans-serif;font-size:30px;margin-top:28px;color:#D7E8DD;line-height:1.35">Local news, restaurants, events and the equestrian season in Wellington, Florida</div></div></div></body></html>`;
const icon = (s) => `<html><body style="margin:0"><svg width="${s}" height="${s}" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A7A45"/><stop offset="1" stop-color="#0E2F1C"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#g)"/><svg x="13" y="7" width="38" height="50" viewBox="5 2 52 63">${inner}</svg></svg></body></html>`;
const b = await chromium.launch();
const shot = async (html, w, h, path, type = "png") => { const p = await b.newPage({ viewport: { width: w, height: h } }); await p.setContent(html); await p.screenshot({ path, type, ...(type === "jpeg" ? { quality: 82 } : { omitBackground: true }) }); await p.close(); };
await shot(og, 1200, 630, "src/static/asset-og.jpg", "jpeg");
await shot(icon(512), 512, 512, "src/static/asset-icon-512.png");
await shot(icon(180), 180, 180, "src/static/apple-touch-icon.png");
await shot(icon(32), 32, 32, "src/static/favicon-32.png");
await b.close();
console.log("Images generated");
