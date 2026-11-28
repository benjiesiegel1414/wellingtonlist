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
  var SEARCH_V = tsq ? (tsq.dataset.v || "1") : "1";
  {
    var IDX = null, loading = false, waiting = [];
    var norm = function(s){ return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim(); };
    var escH = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); };
    var load = function(cb){
      if (IDX) return cb();
      waiting.push(cb);
      if (loading) return; loading = true;
      fetch("/assets/search.json?v=" + SEARCH_V).then(function(r){ return r.json(); }).then(function(d){
        IDX = d.map(function(r){ return { t: r[0], n: r[1], u: r[2], s: r[3], k: norm(r[1]), x: norm(r[3] + " " + r[4]) }; });
        var w = waiting; waiting = []; w.forEach(function(fn){ fn(); });
      }).catch(function(){ loading = false; waiting = []; });
    };
    var TYPE_W = { Service: 6, Guide: 5, Event: 4, Place: 3, News: 0 };
    var score = function(e, q, toks){
      var k = e.k, words = k.split(" "), sc = 0;
      if (k === q) sc += 100; else if (k.indexOf(q) === 0) sc += 60; else if ((" " + k).indexOf(" " + q) !== -1) sc += 40; else if (q.length >= 5 && k.indexOf(q) !== -1) sc += 20;
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i], hit = 0;
        for (var j = 0; j < words.length; j++) { if (words[j].indexOf(t) === 0) { hit = 12; break; } }
        if (!hit && t.length >= 5 && k.indexOf(t) !== -1) hit = 6;
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
    var attach = function(tsq, tsl, pfx, catSel){
      var sel = -1, items = [];
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
          return '<li role="option" id="' + pfx + n + '" aria-selected="false"><a href="' + escH(e.u) + '" tabindex="-1"><b>' + hl(e.n, toks) + '</b>' + (e.s ? '<span>' + escH(e.s) + '</span>' : '') + '<em>' + e.t + '</em></a></li>';
        }).join("");
        if (!top.length) html = '<li class="ts-none" role="presentation">No matches for "' + escH(raw.trim()) + '" yet. Try a shorter word.</li>';
        html += '<li role="option" id="' + pfx + 'all" class="ts-all" aria-selected="false"><a href="/directory/?q=' + encodeURIComponent(raw.trim()) + (catSel && catSel.value && catSel.value !== "all" ? "&cat=" + encodeURIComponent(catSel.value) : "") + '" tabindex="-1">Search the directory for "' + escH(raw.trim()) + '"</a></li>';
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
      document.addEventListener("click", function(ev){ if (ev.target !== tsq && !tsl.contains(ev.target)) close(); });
    };
    if (tsq && tsl) {
      attach(tsq, tsl, "ts-o", null);
      // On the directory page, keep the top box and the page filter in sync
      var pq = new URLSearchParams(location.search).get("q");
      if (pq && location.pathname.indexOf("/directory") === 0) tsq.value = pq;
    }
    // Every other search box on the site gets the same suggestions
    Array.prototype.forEach.call(document.querySelectorAll('.hero form.search input[type="search"], #dir-q'), function(inp, n){
      var box = inp.closest(".search"); if (!box) return;
      var ul = document.createElement("ul");
      ul.className = "ts-list ts-list-page"; ul.id = "ps-list" + n; ul.setAttribute("role", "listbox"); ul.hidden = true;
      document.body.appendChild(ul);
      var place = function(){ var r = box.getBoundingClientRect(); ul.style.top = (r.bottom + window.scrollY + 6) + "px"; ul.style.left = (r.left + window.scrollX) + "px"; ul.style.width = r.width + "px"; };
      inp.addEventListener("focus", place); inp.addEventListener("input", place); window.addEventListener("resize", place);
      inp.setAttribute("autocomplete", "off"); inp.setAttribute("role", "combobox"); inp.setAttribute("aria-autocomplete", "list"); inp.setAttribute("aria-expanded", "false"); inp.setAttribute("aria-controls", ul.id);
      attach(inp, ul, "ps" + n + "-o", box.querySelector('select[name="cat"]'));
    });
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

  // Listing forms: combine the 7 day-by-day hours boxes into one "Mon 9am-5pm; ..." field, and count description words.
  Array.prototype.slice.call(document.querySelectorAll(".biz-form")).forEach(function(form){
    var hidden = form.querySelector("input[name=hours]");
    var dayInputs = form.querySelectorAll(".hours-grid input");
    var syncHours = function(){
      if (!hidden) return;
      var parts = [];
      Array.prototype.forEach.call(dayInputs, function(inp){
        var v = inp.value.trim().replace(/\s*(–|—|to)\s*/gi, "-").replace(/\s+/g, "").replace(/(\d)(AM|PM)/gi, function(m, d, ap){ return d + ap.toLowerCase(); });
        if (v) parts.push(inp.name.slice(2) + " " + (/^closed$/i.test(v) ? "closed" : v));
      });
      hidden.value = parts.join("; ");
    };
    Array.prototype.forEach.call(dayInputs, function(inp){ inp.addEventListener("input", syncHours); });
    var ta = form.querySelector("textarea[data-minwords]"), wc = form.querySelector(".wc");
    if (ta) {
      var min = +ta.dataset.minwords, max = min >= 60 ? 600 : 150;
      var count = function(){
        var n = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
        if (wc) wc.textContent = n + " words";
        ta.setCustomValidity(n < min ? "Please write at least " + min + " words." : n > max ? "Please keep it under " + max + " words." : "");
      };
      ta.addEventListener("input", count); count();
    }
    form.addEventListener("submit", syncHours, true);
  });

  // Featured setup page (after Stripe checkout): resize photos in the browser, then send everything as one JSON post.
  var ff = document.querySelector("[data-featured-form]");
  if (ff) {
    var qs = new URLSearchParams(location.search);
    var plan = qs.get("plan") || "", session = qs.get("session_id") || "";
    if (session) { document.getElementById("setup-paid").hidden = false; document.getElementById("setup-plan").textContent = plan === "lifetime" ? "Lifetime Featured ($49)." : "Featured monthly ($19/month)."; }
    else document.getElementById("setup-unpaid").hidden = false;
    var resize = function(file, max, type){
      return new Promise(function(res){
        var img = new Image(), url = URL.createObjectURL(file);
        img.onload = function(){
          var s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          var x = c.getContext("2d"); if (type === "image/jpeg") { x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); }
          x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL(type, 0.82));
        };
        img.onerror = function(){ URL.revokeObjectURL(url); res(""); };
        img.src = url;
      });
    };
    var photosIn = ff.querySelector("[name=photo_files]"), prev = document.getElementById("photo-previews");
    photosIn.addEventListener("change", function(){
      if (photosIn.files.length > 10) alert("Up to 10 photos, please. We'll use the first 10.");
      prev.innerHTML = "";
      Array.prototype.slice.call(photosIn.files, 0, 10).forEach(function(f){ var i = document.createElement("img"); i.src = URL.createObjectURL(f); prev.appendChild(i); });
    });
    var st = document.getElementById("featured-status"), btn = document.getElementById("featured-submit");
    ff.addEventListener("submit", function(e){
      e.preventDefault();
      if (ff.querySelector(".hp input") && ff.querySelector(".hp input").value) return;
      btn.disabled = true; st.textContent = "Preparing your photos...";
      var fd = new FormData(ff), p = { form_type: "Featured", plan: plan, session_id: session, page: location.pathname, mention_in: fd.getAll("mention_in").join(", ") };
      fd.forEach(function(v, k){ if (typeof v === "string" && k !== "mention_in" && k.indexOf("h_") !== 0) p[k] = v; });
      var logoFile = ff.querySelector("[name=logo_file]").files[0];
      var files = Array.prototype.slice.call(photosIn.files, 0, 10);
      Promise.all([logoFile ? resize(logoFile, 600, logoFile.type === "image/png" ? "image/png" : "image/jpeg") : Promise.resolve("")].concat(files.map(function(f){ return resize(f, 1600, "image/jpeg"); })))
        .then(function(out){
          p.logo = out[0]; p.photos = out.slice(1).filter(Boolean);
          st.textContent = "Uploading " + p.photos.length + " photo" + (p.photos.length === 1 ? "" : "s") + "... this can take up to a minute.";
          if (!cfg.formEndpoint) throw new Error("no endpoint");
          return fetch(cfg.formEndpoint, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(p) });
        })
        .then(function(){
          ff.innerHTML = '<div class="setup-done"><h2>You\'re all set!</h2><p>We received your details and photos. Your Featured listing usually goes live within the hour, and we\'ll email you at ' + (p.email || "your address") + ' if we have any questions.</p><a class="btn btn-primary" href="/">Back to Wellington List</a></div>';
          if (window.gtag) gtag("event", "featured_setup_submitted", { plan: plan });
        })
        .catch(function(){ btn.disabled = false; st.textContent = "Something went wrong. Please try again, or email your details and photos to hello@wellingtonlist.com"; });
    });
  }

  // Forms: post to Apps Script endpoint, or fall back to a pre-filled email
  Array.prototype.slice.call(document.querySelectorAll("form[data-wl-form]")).forEach(function(form){
    var status = form.querySelector(".status");
    var btn = form.querySelector('button[type=submit], input[type=submit]');
    var sending = false;
    form.addEventListener("submit", function(e){
      e.preventDefault();
      if (sending) return; // one submission per click, even if the button is pressed again
      if (form.querySelector(".hp input") && form.querySelector(".hp input").value) return; // spam trap
      var data = new FormData(form);
      data.append("form_type", form.dataset.wlForm);
      data.append("page", location.pathname);
      var label = btn ? (btn.tagName === "INPUT" ? btn.value : btn.textContent) : "";
      var setBtn = function(t, off){ if (!btn) return; btn.disabled = off; if (btn.tagName === "INPUT") btn.value = t; else btn.textContent = t; };
      sending = true; setBtn("Sending...", true);
      if (status) status.textContent = "Sending your submission. This can take a few seconds.";
      var done = function(){
        var msg = form.dataset.success || "Thank you, we received your submission.";
        var box = document.createElement("div");
        box.className = "form-done"; box.setAttribute("role", "status"); box.tabIndex = -1;
        box.innerHTML = "<strong>Got it. Your submission was received.</strong><p></p>";
        box.querySelector("p").textContent = msg + " You only need to submit once.";
        form.parentNode.insertBefore(box, form);
        form.hidden = true;
        box.scrollIntoView({ block: "center" }); box.focus({ preventScroll: true });
      };
      var fail = function(){ sending = false; setBtn(label, false); if (status) status.textContent = "Something went wrong. Please try again."; };
      if (cfg.formEndpoint) {
        fetch(cfg.formEndpoint, { method: "POST", mode: "no-cors", body: data }).then(done).catch(fail);
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
