(function(){
  var cfg = window.WL_CONFIG || {};

  // Analytics (only if configured)
  if (cfg.ga4) {
    var s = document.createElement("script");
    s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + cfg.ga4;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ dataLayer.push(arguments); };
    gtag("js", new Date()); gtag("config", cfg.ga4);
  }

  // Utility bar date and footer year
  var today = document.getElementById("today");
  if (today) today.textContent = new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"}) + ", Wellington, FL";
  var yr = document.getElementById("yr");
  if (yr) yr.textContent = new Date().getFullYear();

  // Mobile menu
  var tog = document.querySelector(".menu-toggle"), nav = document.getElementById("mainnav");
  if (tog && nav) tog.addEventListener("click", function(){
    var o = nav.classList.toggle("open"); tog.setAttribute("aria-expanded", o);
  });

  // WEF countdown
  var cd = document.getElementById("cd-d");
  if (cd) {
    var wef = new Date("2027-01-06T08:00:00-05:00");
    var tick = function(){
      var s = Math.max(0, Math.floor((wef - new Date())/1000));
      var d = Math.floor(s/86400); s %= 86400;
      var h = Math.floor(s/3600); s %= 3600;
      var m = Math.floor(s/60); s %= 60;
      document.getElementById("cd-d").textContent = d;
      document.getElementById("cd-h").textContent = String(h).padStart(2,"0");
      document.getElementById("cd-m").textContent = String(m).padStart(2,"0");
      document.getElementById("cd-s").textContent = String(s).padStart(2,"0");
    };
    tick(); setInterval(tick, 1000);
  }

  // Sticky predictive search (index is fetched the first time the box is used)
  var tsq = document.getElementById("ts-q"), tsl = document.getElementById("ts-list");
  if (tsq && tsl) {
    var IDX = null, loading = false, sel = -1, items = [];
    var norm = function(s){ return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim(); };
    var escH = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); };
    var load = function(cb){
      if (IDX) return cb();
      if (loading) return; loading = true;
      fetch("/assets/search.json?v=" + (tsq.dataset.v || "1")).then(function(r){ return r.json(); }).then(function(d){
        IDX = d.map(function(r){ return { t: r[0], n: r[1], u: r[2], s: r[3], k: norm(r[1]), x: norm(r[3] + " " + r[4]) }; });
        cb();
      }).catch(function(){ loading = false; });
    };
    var TYPE_W = { Service: 6, Guide: 5, Event: 4, Place: 3, News: 0 };
    var score = function(e, q, toks){
      var k = e.k, words = k.split(" "), sc = 0;
      if (k === q) sc += 100; else if (k.indexOf(q) === 0) sc += 60; else if ((" " + k).indexOf(" " + q) !== -1) sc += 40; else if (q.length >= 4 && k.indexOf(q) !== -1) sc += 20;
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i], hit = 0;
        for (var j = 0; j < words.length; j++) { if (words[j].indexOf(t) === 0) { hit = 12; break; } }
        if (!hit && t.length >= 4 && k.indexOf(t) !== -1) hit = 6;
        if (!hit && (" " + e.x).indexOf(" " + t) !== -1) hit = 4;
        if (!hit) return 0;
        sc += hit;
      }
      return sc + (TYPE_W[e.t] || 0);
    };
    var hl = function(name, toks){
      var out = escH(name);
      toks.slice().sort(function(a, b){ return b.length - a.length; }).slice(0, 3).forEach(function(t){
        if (t.length < 2) return;
        out = out.replace(new RegExp("(^|[^a-zA-Z0-9;])(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?![^<]*>)", "i"), "$1<mark>$2</mark>");
      });
      return out;
    };
    var close = function(){ tsl.hidden = true; tsq.setAttribute("aria-expanded", "false"); sel = -1; };
    var mark = function(){
      items.forEach(function(li, i){ li.setAttribute("aria-selected", i === sel ? "true" : "false"); });
      if (sel >= 0 && items[sel]) { tsq.setAttribute("aria-activedescendant", items[sel].id); items[sel].scrollIntoView({ block: "nearest" }); }
      else tsq.removeAttribute("aria-activedescendant");
    };
    var render = function(){
      var raw = tsq.value, q = norm(raw);
      if (q.length < 2 || !IDX) return close();
      var toks = q.split(" ");
      var res = [];
      for (var i = 0; i < IDX.length; i++) { var sc = score(IDX[i], q, toks); if (sc) res.push([sc, i]); }
      res.sort(function(a, b){ return b[0] - a[0] || a[1] - b[1]; });
      var top = [], news = 0;
      for (var r = 0; r < res.length && top.length < 8; r++) {
        var e = IDX[res[r][1]];
        if (e.t === "News") { if (news >= 4) continue; news++; }
        top.push(e);
      }
      var html = top.map(function(e, n){
        return '<li role="option" id="ts-o' + n + '" aria-selected="false"><a href="' + escH(e.u) + '" tabindex="-1"><b>' + hl(e.n, toks) + '</b>' + (e.s ? '<span>' + escH(e.s) + '</span>' : '') + '<em>' + e.t + '</em></a></li>';
      }).join("");
      if (!top.length) html = '<li class="ts-none" role="presentation">No matches for "' + escH(raw.trim()) + '" yet. Try a shorter word.</li>';
      html += '<li role="option" id="ts-oall" class="ts-all" aria-selected="false"><a href="/directory/?q=' + encodeURIComponent(raw.trim()) + '" tabindex="-1">Search the directory for "' + escH(raw.trim()) + '"</a></li>';
      tsl.innerHTML = html; tsl.hidden = false; tsq.setAttribute("aria-expanded", "true");
      items = Array.prototype.slice.call(tsl.querySelectorAll('li[role="option"]')); sel = -1;
    };
    var kick = function(){ load(render); };
    tsq.addEventListener("focus", kick);
    tsq.addEventListener("input", kick);
    tsq.addEventListener("keydown", function(ev){
      if (tsl.hidden) { if (ev.key === "ArrowDown") kick(); return; }
      if (ev.key === "ArrowDown") { ev.preventDefault(); sel = sel + 1 >= items.length ? 0 : sel + 1; mark(); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); sel = sel <= 0 ? items.length - 1 : sel - 1; mark(); }
      else if (ev.key === "Enter" && sel >= 0 && items[sel]) { ev.preventDefault(); location.href = items[sel].querySelector("a").getAttribute("href"); }
      else if (ev.key === "Escape") { close(); }
    });
    tsl.addEventListener("mousedown", function(ev){ ev.preventDefault(); });
    document.addEventListener("click", function(ev){ if (!ev.target.closest(".ts-form")) close(); });
    // On the directory page, keep the top box and the page filter in sync
    var pq = new URLSearchParams(location.search).get("q");
    if (pq && location.pathname.indexOf("/directory") === 0) tsq.value = pq;
  }

  // Directory filtering (works on pre-rendered cards)
  var grid = document.querySelector("[data-filter-grid]");
  if (grid) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll(".listing"));
    var input = document.getElementById("dir-q");
    var buttons = Array.prototype.slice.call(document.querySelectorAll(".filters button"));
    var note = document.getElementById("count-note");
    var params = new URLSearchParams(location.search);
    var state = { cat: params.get("cat") || "all", q: params.get("q") || "" };
    if (input) input.value = state.q;
    var apply = function(){
      var term = state.q.trim().toLowerCase(), shown = 0;
      cards.forEach(function(c){
        var ok = (state.cat === "all" || c.dataset.cat === state.cat) &&
                 (!term || c.dataset.search.indexOf(term) !== -1);
        c.hidden = !ok; if (ok) shown++;
      });
      buttons.forEach(function(b){ b.setAttribute("aria-pressed", b.dataset.f === state.cat); });
      if (note) note.textContent = shown ? shown + " places" : "No places match yet. Try a broader search, or add a business.";
    };
    buttons.forEach(function(b){ b.addEventListener("click", function(){ state.cat = b.dataset.f; apply(); }); });
    if (input) input.addEventListener("input", function(){ state.q = input.value; apply(); });
    apply();
  }

  // Forms: post to Apps Script endpoint, or fall back to a pre-filled email
  Array.prototype.slice.call(document.querySelectorAll("form[data-wl-form]")).forEach(function(form){
    var status = form.querySelector(".status");
    form.addEventListener("submit", function(e){
      e.preventDefault();
      if (form.querySelector(".hp input") && form.querySelector(".hp input").value) return; // spam trap
      var data = new FormData(form);
      data.append("form_type", form.dataset.wlForm);
      data.append("page", location.pathname);
      var done = function(){
        if (status) status.textContent = form.dataset.success || "Thank you, we received your submission.";
        form.reset();
      };
      if (cfg.formEndpoint) {
        fetch(cfg.formEndpoint, { method: "POST", mode: "no-cors", body: data })
          .then(done)
          .catch(function(){ if (status) status.textContent = "Something went wrong. Please try again."; });
      } else {
        var lines = [];
        data.forEach(function(v, k){ if (k !== "website_url_hp") lines.push(k + ": " + v); });
        location.href = "mailto:" + (cfg.fallbackEmail || "") + "?subject=" +
          encodeURIComponent("WellingtonList.com " + form.dataset.wlForm) + "&body=" + encodeURIComponent(lines.join("\n"));
        done();
      }
    });
  });

  // Pre-fill claim forms (?claim=slug)
  var claim = new URLSearchParams(location.search).get("claim");
  var claimField = document.querySelector("[name=claim_listing]");
  if (claim && claimField) claimField.value = claim;

  // Local sponsor bar: rotate through sponsors every 6 seconds
  var barItems = document.querySelectorAll(".sp-bar-item");
  if (barItems.length > 1 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var bi = 0;
    setInterval(function(){
      barItems[bi].classList.remove("on");
      bi = (bi + 1) % barItems.length;
      barItems[bi].classList.add("on");
    }, 6000);
  }

  // Desktop sponsor rails: fade out when the footer sponsor section or footer is on screen
  var rails = document.querySelectorAll(".sp-rail");
  var endZone = document.querySelector(".sp-show") || document.querySelector("footer");
  if (rails.length && endZone && "IntersectionObserver" in window) {
    new IntersectionObserver(function(entries){
      var vis = entries[0].isIntersecting;
      rails.forEach(function(r){ r.classList.toggle("hide", vis); });
    }).observe(endZone);
  }

  // Track sponsor clicks in analytics
  document.addEventListener("click", function(e){
    var a = e.target.closest && e.target.closest(".sp-card,.sp-bar-item");
    if (a && window.gtag) gtag("event", "sponsor_click", { link_url: a.href, open_spot: a.classList.contains("open") || /advertise/.test(a.href) });
  });
  // Advertise page: sticky "Claim my spot" bar shows from landing, hides only when the final CTA box is on screen
  var sticky = document.querySelector(".adv-sticky"), finalBox = document.querySelector(".adv-final");
  if (sticky) {
    var setSticky = function(on){ sticky.classList.toggle("show", on); sticky.setAttribute("aria-hidden", on ? "false" : "true"); };
    setSticky(true);
    if (finalBox) {
      var chk = function(){ setSticky(finalBox.getBoundingClientRect().top > window.innerHeight - 40); };
      window.addEventListener("scroll", chk, { passive: true }); window.addEventListener("resize", chk); chk();
    }
  }
  document.addEventListener("click", function(e){
    var c = e.target.closest && e.target.closest("[data-checkout]");
    if (c && window.gtag) gtag("event", "sponsor_checkout_click", { link_url: c.href });
  });
})();
