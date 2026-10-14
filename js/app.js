/* Cutly - الواجهة: المكتبة، لوحة الخصائص، أزرار التحكم، الاختصارات، التصدير */
(function () {
  "use strict";

  const C = window.Cutly;
  const S = C.store;
  const E = C.engine;
  const T = C.timeline;
  const U = C.util;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // إنشاء عنصر بسرعة (النص بيتحط بـ textContent عشان أسماء الملفات تبقى آمنة)
  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3400);
  }

  /* ---------- الخطوط ---------- */
  const FONTS = [
    ["Cairo", "القاهرة (Cairo)"],
    ["Tajawal", "تجوّل (Tajawal)"],
    ["Amiri", "أميري (خط نسخ)"],
    ["Lalezar", "لالزار (عناوين)"],
    ["Reem Kufi", "ريم كوفي"],
  ];
  const stack = (n) => '"' + n + '", Cairo, Tahoma, Arial, sans-serif';
  const familyOf = (s) => String(s || "").split(",")[0].replace(/["']/g, "").trim();
  function loadFont(name) {
    try { if (document.fonts && document.fonts.load) document.fonts.load('700 40px "' + name + '"'); } catch (e) { /* ignore */ }
  }

  /* ---------- جاهز: نصوص وخلفيات ---------- */
  const TEXT_PRESETS = [
    { name: "عنوان كبير", patch: { text: "عنوان كبير", fontSize: 110, font: stack("Lalezar") } },
    { name: "نص عادي", patch: { text: "اكتب هنا", fontSize: 64 } },
    { name: "ترجمة", patch: { text: "الترجمة هنا", fontSize: 52, bgOn: true, stroke: false, y: 36 } },
    { name: "نيون", patch: { text: "نيون", fontSize: 90, color: "#25f4ee", strokeColor: "#fe2c55" } },
    { name: "أصفر قوي", patch: { text: "مهم!", fontSize: 100, color: "#ffd400" } },
    { name: "أنيق", patch: { text: "أنيق", fontSize: 84, font: stack("Amiri"), stroke: false, bold: false } },
  ];
  const GRADIENTS = [
    ["غروب", "#ff7e5f", "#feb47b"], ["محيط", "#2193b0", "#6dd5ed"], ["بنفسجي", "#7b2ff7", "#f107a3"],
    ["ليل", "#0f2027", "#2c5364"], ["نعناع", "#11998e", "#38ef7d"], ["كحلي", "#141e30", "#243b55"],
  ];
  const FILTER_KEYS = { brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0 };
  const FILTER_PRESETS = [
    ["الأصلي", Object.assign({}, FILTER_KEYS)],
    ["أبيض وأسود", Object.assign({}, FILTER_KEYS, { grayscale: 100, contrast: 110 })],
    ["قديم", Object.assign({}, FILTER_KEYS, { sepia: 70, contrast: 90, brightness: 95 })],
    ["دافي", Object.assign({}, FILTER_KEYS, { sepia: 25, saturate: 130, hue: -10 })],
    ["بارد", Object.assign({}, FILTER_KEYS, { hue: 15, saturate: 110, brightness: 105 })],
    ["حيوي", Object.assign({}, FILTER_KEYS, { saturate: 160, contrast: 115 })],
  ];
  const ASPECT_NAMES = { "16:9": "16:9 يوتيوب", "9:16": "9:16 ريلز", "1:1": "1:1 مربع", "4:5": "4:5 انستجرام" };
  const KIND_NAMES = { video: "فيديو", image: "صورة", audio: "صوت", text: "نص" };

  /* ---------- المكتبة ---------- */
  function renderMedia() {
    const list = $("#mediaList");
    list.innerHTML = "";
    const arr = Object.values(S.state.media);
    if (!arr.length) {
      const p = h("p", "muted small", "لسه مفيش ملفات. استورد حاجة عشان تبدأ، أو جرب الخلفيات الجاهزة من تبويب \"جاهز\".");
      p.style.gridColumn = "1 / -1";
      list.appendChild(p);
      return;
    }
    for (const m of arr) {
      const card = h("div", "mcard");
      card.draggable = true;
      card.title = "دوس لإضافته للتايم لاين أو اسحبه";
      const th = h("div", "thumb", m.kind === "audio" ? "🎵" : "");
      if (m.thumb && m.kind !== "audio") th.style.backgroundImage = 'url("' + m.thumb + '")';
      const meta = h("div", "meta");
      meta.appendChild(h("div", "nm", m.name));
      meta.appendChild(h("div", "du", KIND_NAMES[m.kind] + (m.kind === "image" ? "" : " · " + U.fmtTime(m.duration))));
      const add = h("button", "add", "+");
      add.title = "أضف للتايم لاين";
      const rm = h("button", "rm", "×");
      rm.title = "احذف من المكتبة";
      card.append(th, meta, add, rm);

      card.addEventListener("click", () => addToTimeline(m.id));
      add.addEventListener("click", (e) => { e.stopPropagation(); addToTimeline(m.id); });
      rm.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("هتحذف الملف ده وكل مقاطعه من التايم لاين. متأكد؟")) S.removeMedia(m.id);
      });
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/cutly-media", m.id);
        e.dataTransfer.effectAllowed = "copy";
      });
      list.appendChild(card);
    }
  }

  function addToTimeline(mediaId) {
    E.ensureAudio();
    S.addClipFromMedia(mediaId, { start: E.t });
  }

  async function importFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    toast("جاري استيراد " + list.length + " ملف…");
    const wasEmpty = !S.hasClips();
    let first = null;
    for (const f of list) {
      try {
        const m = await E.importFile(f);
        if (!first) first = m;
      } catch (e) {
        toast(e.message);
      }
    }
    if (first && wasEmpty) S.addClipFromMedia(first.id, { start: 0 });
    if (first) toast("تم الاستيراد ✓");
  }

  function buildPresets() {
    const tp = $("#textPresets");
    for (const p of TEXT_PRESETS) {
      const b = h("button", "preset", p.name);
      b.style.fontFamily = p.patch.font || "";
      if (p.patch.color) b.style.color = p.patch.color;
      b.addEventListener("click", () => { S.addText(p.patch, E.t, 3); toast("اتضاف نص. عدّل عليه من الخصائص."); });
      tp.appendChild(b);
    }
    const gp = $("#gradPresets");
    for (const g of GRADIENTS) {
      const b = h("button", "preset", g[0]);
      b.style.background = "linear-gradient(135deg," + g[1] + "," + g[2] + ")";
      b.style.color = "#fff";
      b.style.textShadow = "0 1px 3px rgba(0,0,0,.6)";
      b.addEventListener("click", async () => {
        try {
          const m = await E.addGradient(g[0], g[1], g[2]);
          S.addClipFromMedia(m.id, { start: E.t });
        } catch (e) { toast(e.message); }
      });
      gp.appendChild(b);
    }
  }

  /* ---------- لوحة الخصائص ---------- */
  const insp = $("#inspector");
  let editing = false;

  function group(title) {
    const g = h("div", "group");
    g.appendChild(h("h4", null, title));
    insp.appendChild(g);
    return g;
  }

  function rowRange(parent, label, id, key, min, max, step, unit, value) {
    const row = h("div", "row");
    const inp = h("input");
    inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = value;
    const out = h("output", null, value + unit);
    inp.addEventListener("input", () => {
      if (!editing) { S.beginEdit(); editing = true; }
      const v = parseFloat(inp.value);
      S.setProps(id, { [key]: v }, true);
      out.textContent = v + unit;
    });
    inp.addEventListener("change", () => { editing = false; });
    row.append(h("label", null, label), inp, out);
    parent.appendChild(row);
  }

  function rowColor(parent, label, id, key, value) {
    const row = h("div", "row simple");
    const inp = h("input");
    inp.type = "color"; inp.value = value || "#ffffff";
    inp.addEventListener("input", () => {
      if (!editing) { S.beginEdit(); editing = true; }
      S.setProps(id, { [key]: inp.value }, true);
    });
    inp.addEventListener("change", () => { editing = false; });
    row.append(h("label", null, label), inp);
    parent.appendChild(row);
  }

  function rowCheck(parent, label, id, key, value) {
    const row = h("div", "row simple");
    const inp = h("input");
    inp.type = "checkbox"; inp.checked = !!value;
    inp.addEventListener("change", () => { S.setProps(id, { [key]: inp.checked }); });
    row.append(h("label", null, label), inp);
    parent.appendChild(row);
  }

  function chips(parent, items, isOn, onPick) {
    const wrap = h("div", "chips");
    for (const it of items) {
      const b = h("button", "chip" + (isOn(it) ? " on" : ""), it.label);
      b.addEventListener("click", () => onPick(it));
      wrap.appendChild(b);
    }
    parent.appendChild(wrap);
  }

  function renderInspector() {
    insp.innerHTML = "";
    const sel = S.state.selection;
    const f = sel && S.find(sel);
    if (!f) return renderProjectPanel();

    const c = f.clip;
    const p = c.props;
    const id = c.id;
    const m = c.mediaId ? S.state.media[c.mediaId] : null;

    const head = group(KIND_NAMES[c.kind] + (m ? " — " + m.name : ""));
    head.querySelector("h4").style.direction = "ltr";
    head.appendChild(h("p", "muted small", "المدة: " + U.fmtTime(c.dur) + " · البداية: " + U.fmtTime(c.start)));

    if (c.kind === "text") {
      const g = group("النص");
      const ta = h("textarea", "txt");
      ta.value = p.text;
      ta.addEventListener("input", () => {
        if (!editing) { S.beginEdit(); editing = true; }
        S.setProps(id, { text: ta.value }, true);
      });
      ta.addEventListener("change", () => { editing = false; });
      g.appendChild(ta);

      const frow = h("div", "row simple");
      const sel2 = h("select", "sel");
      const cur = familyOf(p.font);
      for (const [name, label] of FONTS) {
        const o = h("option", null, label);
        o.value = name;
        if (name === cur) o.selected = true;
        sel2.appendChild(o);
      }
      sel2.addEventListener("change", () => { loadFont(sel2.value); S.setProps(id, { font: stack(sel2.value) }); });
      frow.append(h("label", null, "الخط"), sel2);
      g.appendChild(frow);

      rowRange(g, "حجم الخط", id, "fontSize", 20, 220, 1, "", p.fontSize);
      rowColor(g, "اللون", id, "color", p.color);
      rowCheck(g, "غامق", id, "bold", p.bold);
      rowCheck(g, "حدود", id, "stroke", p.stroke);
      rowColor(g, "لون الحدود", id, "strokeColor", p.strokeColor);
      rowCheck(g, "خلفية", id, "bgOn", p.bgOn);
      rowColor(g, "لون الخلفية", id, "bg", p.bg);
      rowRange(g, "شفافية الخلفية", id, "bgOpacity", 0, 100, 1, "%", p.bgOpacity);
    }

    if (c.kind !== "audio") {
      const g = group("المكان والحجم");
      rowRange(g, "الحجم", id, "scale", 10, 400, 1, "%", p.scale);
      rowRange(g, "أفقي (X)", id, "x", -100, 100, 0.5, "", p.x);
      rowRange(g, "رأسي (Y)", id, "y", -100, 100, 0.5, "", p.y);
      rowRange(g, "تدوير", id, "rotate", -180, 180, 1, "°", p.rotate);
      rowRange(g, "الشفافية", id, "opacity", 0, 100, 1, "%", p.opacity);
      g.appendChild(h("p", "muted small", "تقدر كمان تسحب المقطع في المعاينة وتكبره من أطراف الإطار."));
    }

    if (c.kind === "video" || c.kind === "image") {
      const g = group("ألوان وفلاتر");
      chips(g, FILTER_PRESETS.map((x) => ({ label: x[0], patch: x[1] })),
        (it) => Object.keys(FILTER_KEYS).every((k) => p[k] === it.patch[k]),
        (it) => { S.setProps(id, it.patch); renderInspector(); });
      rowRange(g, "السطوع", id, "brightness", 0, 200, 1, "%", p.brightness);
      rowRange(g, "التباين", id, "contrast", 0, 200, 1, "%", p.contrast);
      rowRange(g, "التشبع", id, "saturate", 0, 300, 1, "%", p.saturate);
      rowRange(g, "درجة اللون", id, "hue", -180, 180, 1, "°", p.hue);
      rowRange(g, "تغبيش", id, "blur", 0, 20, 0.5, "", p.blur);
      rowRange(g, "أبيض وأسود", id, "grayscale", 0, 100, 1, "%", p.grayscale);
      rowRange(g, "سيبيا", id, "sepia", 0, 100, 1, "%", p.sepia);
    }

    if (c.kind === "video" || c.kind === "audio") {
      const g = group("الصوت والسرعة");
      rowRange(g, "مستوى الصوت", id, "volume", 0, 200, 1, "%", p.volume);
      g.appendChild(h("p", "muted small", "السرعة"));
      chips(g, [0.25, 0.5, 1, 1.5, 2, 3, 4].map((v) => ({ label: "×" + v, v })),
        (it) => Math.abs(c.speed - it.v) < 0.01,
        (it) => { if (!S.setSpeed(id, it.v)) toast("مفيش مكان فاضي كفاية بعد المقطع للسرعة دي. حرّك المقطع اللي بعده الأول."); });
    }

    const g2 = group("ظهور واختفاء تدريجي");
    rowRange(g2, "ظهور", id, "fadeIn", 0, 3, 0.1, "ث", p.fadeIn);
    rowRange(g2, "اختفاء", id, "fadeOut", 0, 3, 0.1, "ث", p.fadeOut);
  }

  function renderProjectPanel() {
    const g = group("المشروع");
    chips(g, Object.keys(ASPECT_NAMES).map((k) => ({ label: ASPECT_NAMES[k], k })),
      (it) => S.state.settings.aspect === it.k,
      (it) => S.setAspect(it.k));
    const row = h("div", "row simple");
    const col = h("input");
    col.type = "color";
    col.value = S.state.settings.bg;
    col.addEventListener("input", () => {
      if (!editing) { S.beginEdit(); editing = true; }
      S.setBg(col.value, true);
    });
    col.addEventListener("change", () => { editing = false; });
    row.append(h("label", null, "لون الخلفية"), col);
    g.appendChild(row);
    g.appendChild(h("p", "muted small", "اختار مقطع من التايم لاين عشان تظهر خصائصه هنا."));

    const k = group("الاختصارات");
    const grid = h("div", "kbd");
    const keys = [
      ["Space", "تشغيل / إيقاف"], ["S", "قسّم عند المؤشر"], ["Delete", "حذف المحدد"],
      ["Ctrl + D", "تكرار"], ["Ctrl + Z", "تراجع"], ["Ctrl + Shift + Z", "إعادة"],
      ["← →", "فريم بفريم"], ["Shift + ← →", "ثانية بثانية"], ["Home / End", "البداية / النهاية"],
    ];
    for (const [a, b] of keys) { grid.appendChild(h("b", null, a)); grid.appendChild(h("span", null, b)); }
    k.appendChild(grid);
  }

  /* ---------- الوقت وحالة الأزرار ---------- */
  function updateTime() {
    $("#timeLabel").textContent = U.fmtTime(E.t) + " / " + U.fmtTime(S.duration());
  }
  function updateButtons() {
    $("#undoBtn").disabled = !S.canUndo();
    $("#redoBtn").disabled = !S.canRedo();
    $("#aspectSel").value = S.state.settings.aspect;
    $("#playBtn").textContent = E.playing ? "⏸" : "▶";
  }

  /* ---------- التصدير ---------- */
  async function doExport() {
    if (E.exporting) return;
    if (!S.hasClips()) { toast("ضيف مقاطع للتايم لاين الأول."); return; }
    const modal = $("#exportModal");
    const bar = $("#expBar");
    const pct = $("#expPct");
    bar.style.width = "0%";
    pct.textContent = "0%";
    modal.hidden = false;
    $("#expCancel").onclick = () => { if (E.cancelExport) E.cancelExport(); };
    try {
      const blob = await E.exportVideo((p) => {
        bar.style.width = Math.round(p * 100) + "%";
        pct.textContent = Math.round(p * 100) + "%";
      });
      const ext = /mp4/.test(blob.type) ? "mp4" : "webm";
      const url = URL.createObjectURL(blob);
      const a = h("a");
      a.href = url;
      a.download = "cutly-video." + ext;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast("اتصدّر الفيديو ✓ (" + ext + ")");
    } catch (e) {
      if (e.message !== "cancelled") toast(e.message || "حصل خطأ في التصدير");
      else toast("اتلغى التصدير");
    } finally {
      modal.hidden = true;
      updateButtons();
    }
  }

  /* ---------- الأحداث ---------- */
  function bindUI() {
    // تبويبات المكتبة
    $$(".tab").forEach((b) => b.addEventListener("click", () => {
      $$(".tab").forEach((x) => x.classList.toggle("active", x === b));
      $$(".tabpane").forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
    }));

    $("#importBtn").addEventListener("click", () => $("#fileInput").click());
    $("#fileInput").addEventListener("change", (e) => { importFiles(e.target.files); e.target.value = ""; });

    $("#undoBtn").addEventListener("click", () => S.undo());
    $("#redoBtn").addEventListener("click", () => S.redo());
    $("#aspectSel").addEventListener("change", (e) => S.setAspect(e.target.value));
    $("#exportBtn").addEventListener("click", doExport);

    $("#toStart").addEventListener("click", () => E.seek(0));
    $("#playBtn").addEventListener("click", () => {
      if (S.duration() <= 0) { toast("ضيف مقاطع الأول."); return; }
      E.toggle();
    });

    $("#splitBtn").addEventListener("click", () => {
      if (!S.splitAtTime(E.t)) toast("حط المؤشر جوه المقطع (بعيد عن حوافه) وبعدين قسّم.");
    });
    $("#dupBtn").addEventListener("click", () => {
      if (!S.state.selection || !S.duplicate(S.state.selection)) toast("اختار مقطع الأول.");
    });
    $("#delBtn").addEventListener("click", () => {
      if (!S.state.selection || !S.deleteClip(S.state.selection)) toast("اختار مقطع الأول.");
    });
    $("#zoom").addEventListener("input", (e) => T.setZoom(parseFloat(e.target.value)));
    $("#snapChk").addEventListener("change", (e) => { T.snap = e.target.checked; });

    // اختصارات الكيبورد
    document.addEventListener("keydown", (e) => {
      if (E.exporting) return;
      const tag = (e.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (ctrl && key === "z") { if (typing && tag === "textarea") return; e.preventDefault(); if (e.shiftKey) S.redo(); else S.undo(); return; }
      if (ctrl && key === "y") { e.preventDefault(); S.redo(); return; }
      if (typing) return;
      if (ctrl && key === "d") { e.preventDefault(); if (S.state.selection) S.duplicate(S.state.selection); return; }
      if (ctrl) return;

      if (e.key === " ") { e.preventDefault(); if (S.duration() > 0) E.toggle(); }
      else if (key === "s") { S.splitAtTime(E.t); }
      else if (e.key === "Delete" || e.key === "Backspace") { if (S.state.selection) { e.preventDefault(); S.deleteClip(S.state.selection); } }
      else if (e.key === "ArrowLeft") { E.seek(E.t - (e.shiftKey ? 1 : 1 / 30)); }
      else if (e.key === "ArrowRight") { E.seek(E.t + (e.shiftKey ? 1 : 1 / 30)); }
      else if (e.key === "Home") { E.seek(0); }
      else if (e.key === "End") { E.seek(S.duration()); }
    });

    // سحب وإفلات الملفات في أي مكان
    const drop = $("#dropHint");
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
    window.addEventListener("dragenter", (e) => { if (hasFiles(e)) { depth++; drop.hidden = false; } });
    window.addEventListener("dragleave", (e) => { if (hasFiles(e)) { depth = Math.max(0, depth - 1); if (!depth) drop.hidden = true; } });
    window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      drop.hidden = true;
      importFiles(e.dataTransfer.files);
    });

    window.addEventListener("beforeunload", (e) => {
      if (S.hasClips() && !E.exporting) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  /* ---------- تشغيل ---------- */
  function start() {
    E.init($("#stage"));
    T.init();
    FONTS.forEach((f) => loadFont(f[0]));

    E.onTime = (t) => { T.onTime(t); updateTime(); };
    E.onState = updateButtons;

    S.on((why) => {
      if (why === "media") renderMedia();
      if (why === "selection" || why === "change") renderInspector();
      if (why === "props") {
        const f = S.state.selection && S.find(S.state.selection);
        if (f && f.clip.kind === "text") {
          const n = $('.clip[data-id="' + f.clip.id + '"] .clip-label');
          if (n) n.textContent = String(f.clip.props.text || "").split("\n")[0];
        }
      }
      updateButtons();
      updateTime();
    });

    bindUI();
    buildPresets();
    renderMedia();
    renderInspector();
    updateButtons();
    updateTime();
  }

  start();
})();
