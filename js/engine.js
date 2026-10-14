/* Cutly - المحرك: رسم الكانفاس، التشغيل، الصوت، استيراد الملفات، التصدير */
(function () {
  "use strict";

  const C = window.Cutly;
  const S = C.store;
  const { clamp, filterString } = C.util;
  const E = (C.engine = { t: 0, playing: false, exporting: false, onTime: null, onState: null, cancelExport: null });

  let canvas = null;
  let ctx = null;
  let actx = null;      // AudioContext
  let master = null;    // GainNode رئيسي
  let recDest = null;   // مخرج الصوت للتسجيل
  const recs = new Map();    // clipId -> { el, gain, kind }
  const bounds = new Map();  // clipId -> مستطيل المقطع على الكانفاس (للتحديد بالماوس)
  let startNow = 0;
  let startT = 0;
  let endedCb = null;
  let lastReported = -1;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- تهيئة ---------- */
  E.init = function (cv) {
    canvas = cv;
    ctx = cv.getContext("2d");
    applyAspect();
    S.on(onStoreChange);
    bindPointer();
    try { if (document.fonts && document.fonts.load) { document.fonts.load("700 40px Cairo"); document.fonts.load("500 40px Cairo"); } } catch (e) { /* ignore */ }
    requestAnimationFrame(loop);
  };

  function applyAspect() {
    const wh = S.ASPECTS[S.state.settings.aspect] || S.ASPECTS["16:9"];
    if (canvas.width !== wh[0] || canvas.height !== wh[1]) {
      canvas.width = wh[0];
      canvas.height = wh[1];
    }
  }

  function onStoreChange(why) {
    applyAspect();
    if (why === "change") {
      const ids = new Set();
      for (const tr of S.state.tracks) for (const c of tr.clips) ids.add(c.id);
      for (const [id, r] of recs) if (!ids.has(id)) disposeRec(id, r);
      const dur = S.duration();
      if (E.t > dur) E.seek(dur);
    }
  }

  function disposeRec(id, r) {
    try { if (r.el && r.el.pause) r.el.pause(); } catch (e) { /* ignore */ }
    try { if (r.gain) r.gain.disconnect(); } catch (e) { /* ignore */ }
    if (r.kind !== "image" && r.el) { try { r.el.removeAttribute("src"); r.el.load(); } catch (e) { /* ignore */ } }
    recs.delete(id);
  }

  /* ---------- الصوت ---------- */
  function ensureAudio() {
    if (actx) return actx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      master = actx.createGain();
      recDest = actx.createMediaStreamDestination();
      master.connect(actx.destination);
      master.connect(recDest);
    } catch (e) {
      actx = null;
    }
    return actx;
  }
  E.ensureAudio = ensureAudio;

  function getRec(clip) {
    let r = recs.get(clip.id);
    if (r) return r;
    const m = S.state.media[clip.mediaId];
    if (!m) return null;
    if (clip.kind === "image") {
      r = { el: m.img, kind: "image" };
    } else {
      const el = document.createElement(clip.kind === "audio" ? "audio" : "video");
      el.preload = "auto";
      el.playsInline = true;
      el.setAttribute("playsinline", "");
      el.src = m.url;
      r = { el, kind: clip.kind, gain: null };
      if (ensureAudio()) {
        try {
          const src = actx.createMediaElementSource(el);
          const g = actx.createGain();
          src.connect(g);
          g.connect(master);
          r.gain = g;
        } catch (e) { r.gain = null; }
      }
    }
    recs.set(clip.id, r);
    if (recs.size > 10) trimRecs(clip.id);
    return r;
  }

  // بنفضي المقاطع اللي مش شغالة دلوقتي عشان الذاكرة متتملاش
  function trimRecs(keepId) {
    const t = E.t;
    for (const [id, r] of recs) {
      if (recs.size <= 8) break;
      if (id === keepId || r.kind === "image") continue;
      const f = S.find(id);
      if (!f) { disposeRec(id, r); continue; }
      const c = f.clip;
      const near = t >= c.start - 2 && t < c.start + c.dur + 0.5;
      if (!near) disposeRec(id, r);
    }
  }

  function fadeFactor(c, t) {
    const local = t - c.start;
    const rem = c.dur - local;
    const p = c.props;
    let f = 1;
    if (p.fadeIn > 0 && local < p.fadeIn) f *= local / p.fadeIn;
    if (p.fadeOut > 0 && rem < p.fadeOut) f *= rem / p.fadeOut;
    return clamp(f, 0, 1);
  }

  function setGain(r, g) {
    if (r.gain) r.gain.gain.value = Math.max(0, g);
    else if (r.el) r.el.volume = clamp(g, 0, 1);
  }

  /* ---------- مزامنة الفيديو والصوت مع الوقت ---------- */
  function syncMedia() {
    const t = E.t;
    for (const tr of S.state.tracks) {
      if (tr.kind === "text") continue;
      for (const c of tr.clips) {
        if (c.kind === "image") continue;
        const active = t >= c.start && t < c.start + c.dur;
        const soon = !active && E.playing && c.start > t && c.start - t < 1.5;
        if (!active && !soon) {
          const r0 = recs.get(c.id);
          if (r0 && !r0.el.paused) r0.el.pause();
          continue;
        }
        const r = getRec(c);
        if (!r) continue;
        const el = r.el;
        if (!active) {
          if (Math.abs(el.currentTime - c.in) > 0.3) el.currentTime = c.in;
          if (!el.paused) el.pause();
          continue;
        }
        const target = c.in + Math.max(0, t - c.start) * c.speed;
        setGain(r, (c.props.volume / 100) * fadeFactor(c, t));
        if (E.playing) {
          if (el.playbackRate !== c.speed) el.playbackRate = c.speed;
          if (el.paused) {
            if (Math.abs(el.currentTime - target) > 0.05) el.currentTime = target;
            const pr = el.play();
            if (pr && pr.catch) pr.catch(() => {});
          } else if (Math.abs(el.currentTime - target) > 0.3) {
            el.currentTime = target;
          }
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - target) > 0.04) el.currentTime = target;
        }
      }
    }
  }

  /* ---------- الرسم ---------- */
  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawClip(c, t) {
    const p = c.props;
    const W = canvas.width;
    const H = canvas.height;
    let alpha = (p.opacity / 100) * fadeFactor(c, t);
    const cx = W / 2 + (p.x / 100) * W;
    const cy = H / 2 + (p.y / 100) * H;
    const sc = p.scale / 100;
    let w = 0;
    let h = 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((p.rotate * Math.PI) / 180);
    ctx.scale(sc, sc);

    if (c.kind === "text") {
      const fs = p.fontSize * (Math.min(W, H) / 720);
      ctx.font = (p.bold ? "700 " : "500 ") + fs + "px " + p.font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lines = String(p.text || "").split("\n");
      const lh = fs * 1.3;
      let maxw = 0;
      for (const ln of lines) maxw = Math.max(maxw, ctx.measureText(ln).width);
      const textH = lines.length * lh;
      w = maxw + (p.bgOn ? fs * 0.8 : fs * 0.2);
      h = textH + (p.bgOn ? fs * 0.4 : fs * 0.1);
      ctx.globalAlpha = clamp(alpha, 0, 1);
      if (p.bgOn) {
        ctx.save();
        ctx.globalAlpha = clamp(alpha * (p.bgOpacity / 100), 0, 1);
        ctx.fillStyle = p.bg || "#000000";
        roundRect(ctx, -w / 2, -h / 2, w, h, fs * 0.25);
        ctx.fill();
        ctx.restore();
      }
      lines.forEach((ln, i) => {
        const y = -textH / 2 + lh * (i + 0.5);
        if (p.stroke) {
          ctx.lineWidth = fs * 0.14;
          ctx.lineJoin = "round";
          ctx.strokeStyle = p.strokeColor || "#000000";
          ctx.strokeText(ln, 0, y);
        }
        ctx.fillStyle = p.color;
        ctx.fillText(ln, 0, y);
      });
    } else {
      const r = getRec(c);
      if (!r || !r.el) { ctx.restore(); return; }
      const el = r.el;
      const sw = el.videoWidth || el.naturalWidth || el.width;
      const sh = el.videoHeight || el.naturalHeight || el.height;
      if (!sw || !sh) { ctx.restore(); return; }
      const fit = Math.min(W / sw, H / sh);
      w = sw * fit;
      h = sh * fit;
      ctx.globalAlpha = clamp(alpha, 0, 1);
      const f = filterString(p, W / 1280);
      if (f !== "none") ctx.filter = f;
      if (r.kind === "image" || el.readyState >= 2) ctx.drawImage(el, -w / 2, -h / 2, w, h);
    }
    ctx.restore();
    bounds.set(c.id, { cx, cy, w: w * sc, h: h * sc, rot: p.rotate });
  }

  function draw(t) {
    const W = canvas.width;
    const H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.fillStyle = S.state.settings.bg;
    ctx.fillRect(0, 0, W, H);
    bounds.clear();
    const tracks = S.state.tracks;
    for (let i = tracks.length - 1; i >= 0; i--) {
      const tr = tracks[i];
      if (tr.kind === "audio") continue;
      for (const c of tr.clips) if (t >= c.start && t < c.start + c.dur) drawClip(c, t);
    }
    if (!E.exporting) drawSelection();
  }

  function drawSelection() {
    const id = S.state.selection;
    const b = id && bounds.get(id);
    if (!b) return;
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate((b.rot * Math.PI) / 180);
    ctx.strokeStyle = "#25f4ee";
    ctx.lineWidth = 3;
    ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    const hs = 16;
    ctx.fillStyle = "#ffffff";
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        ctx.fillRect((sx * b.w) / 2 - hs / 2, (sy * b.h) / 2 - hs / 2, hs, hs);
        ctx.strokeRect((sx * b.w) / 2 - hs / 2, (sy * b.h) / 2 - hs / 2, hs, hs);
      }
    }
    ctx.restore();
  }

  /* ---------- حلقة التشغيل ---------- */
  function loop(now) {
    if (E.playing) {
      E.t = startT + (now - startNow) / 1000;
      const dur = S.duration();
      if (E.t >= dur) {
        E.t = dur;
        E.pause();
        if (endedCb) { const cb = endedCb; endedCb = null; cb(); }
      }
    }
    syncMedia();
    draw(E.t);
    if (E.onTime && (E.playing || E.t !== lastReported)) { lastReported = E.t; E.onTime(E.t); }
    requestAnimationFrame(loop);
  }

  E.play = function () {
    if (E.playing) return;
    const dur = S.duration();
    if (dur <= 0) return;
    if (E.t >= dur - 0.02) E.t = 0;
    ensureAudio();
    if (actx && actx.state === "suspended") actx.resume();
    E.playing = true;
    startNow = performance.now();
    startT = E.t;
    if (E.onState) E.onState();
  };
  E.pause = function () {
    if (!E.playing) return;
    E.playing = false;
    for (const r of recs.values()) if (r.el && r.el.pause && !r.el.paused) r.el.pause();
    if (E.onState) E.onState();
  };
  E.toggle = () => (E.playing ? E.pause() : E.play());
  E.seek = function (t) {
    E.t = clamp(t, 0, Math.max(S.duration(), 0));
    if (E.playing) { startNow = performance.now(); startT = E.t; }
  };
  E.bounds = bounds;

  /* ---------- التحكم بالمقاطع من المعاينة (سحب وتكبير) ---------- */
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
  }
  function toLocal(b, pt) {
    const dx = pt.x - b.cx;
    const dy = pt.y - b.cy;
    const a = (-b.rot * Math.PI) / 180;
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
  }
  function hitHandle(b, pt) {
    const l = toLocal(b, pt);
    const tol = 26;
    return Math.abs(Math.abs(l.x) - b.w / 2) < tol && Math.abs(Math.abs(l.y) - b.h / 2) < tol;
  }
  function hitClip(pt) {
    for (const tr of S.state.tracks) {
      if (tr.kind === "audio") continue;
      for (const c of tr.clips) {
        const b = bounds.get(c.id);
        if (!b) continue;
        const l = toLocal(b, pt);
        if (Math.abs(l.x) <= b.w / 2 && Math.abs(l.y) <= b.h / 2) return c;
      }
    }
    return null;
  }

  let drag = null;
  function bindPointer() {
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => {
      const pt = toCanvas(e);
      const sel = S.state.selection;
      const sb = sel && bounds.get(sel);
      if (sb && hitHandle(sb, pt)) {
        const f = S.find(sel);
        drag = { mode: "scale", id: sel, scale0: f.clip.props.scale, dist0: Math.hypot(pt.x - sb.cx, pt.y - sb.cy) || 1, cx: sb.cx, cy: sb.cy, began: false, px: pt.x, py: pt.y };
      } else {
        const c = hitClip(pt);
        if (!c) { S.select(null); return; }
        S.select(c.id);
        drag = { mode: "move", id: c.id, px: pt.x, py: pt.y, x0: c.props.x, y0: c.props.y, began: false };
      }
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const pt = toCanvas(e);
      if (!drag.began) {
        if (Math.hypot(pt.x - drag.px, pt.y - drag.py) < 4) return;
        S.beginEdit();
        drag.began = true;
      }
      if (drag.mode === "move") {
        S.setProps(drag.id, {
          x: Math.round((drag.x0 + ((pt.x - drag.px) / canvas.width) * 100) * 10) / 10,
          y: Math.round((drag.y0 + ((pt.y - drag.py) / canvas.height) * 100) * 10) / 10,
        }, true);
      } else {
        const d = Math.hypot(pt.x - drag.cx, pt.y - drag.cy);
        S.setProps(drag.id, { scale: Math.round(clamp((drag.scale0 * d) / drag.dist0, 10, 400)) }, true);
      }
    });
    const end = () => { drag = null; };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  }

  /* ---------- استيراد الملفات ---------- */
  function waitEvent(el, ok, ms) {
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, ms || 10000);
      const onOk = () => { cleanup(); resolve(); };
      const onErr = () => { cleanup(); reject(new Error("load")); };
      function cleanup() { clearTimeout(to); el.removeEventListener(ok, onOk); el.removeEventListener("error", onErr); }
      el.addEventListener(ok, onOk);
      el.addEventListener("error", onErr);
    });
  }

  async function videoThumb(v) {
    try {
      v.currentTime = Math.min(0.1, (v.duration || 0.2) / 2);
      await waitEvent(v, "seeked", 4000);
      const c = document.createElement("canvas");
      const ratio = (v.videoWidth || 16) / (v.videoHeight || 9);
      c.height = 96;
      c.width = Math.max(16, Math.round(96 * ratio));
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.7);
    } catch (e) { return null; }
  }

  async function computePeaks(file, duration) {
    try {
      if (file.size > 60 * 1024 * 1024 || !ensureAudio()) return null;
      const buf = await actx.decodeAudioData(await file.arrayBuffer());
      const data = buf.getChannelData(0);
      const n = Math.max(1, Math.min(4000, Math.ceil(duration * 20)));
      const step = Math.max(1, Math.floor(data.length / n));
      const peaks = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let max = 0;
        const s0 = i * step;
        const inc = Math.max(1, Math.floor(step / 24));
        for (let j = 0; j < step; j += inc) { const v = Math.abs(data[s0 + j] || 0); if (v > max) max = v; }
        peaks[i] = max;
      }
      return peaks;
    } catch (e) { return null; }
  }

  E.importFile = async function (file) {
    const kind = file.type.startsWith("video") ? "video" : file.type.startsWith("image") ? "image" : file.type.startsWith("audio") ? "audio" : null;
    if (!kind) throw new Error("نوع الملف مش مدعوم: " + file.name);
    const url = URL.createObjectURL(file);
    const m = { id: S.uid("m_"), name: file.name, kind, url, duration: 0, w: 0, h: 0, thumb: null, peaks: null, size: file.size };
    try {
      if (kind === "image") {
        const img = new Image();
        img.src = url;
        await (img.decode ? img.decode() : waitEvent(img, "load", 10000));
        m.img = img;
        m.w = img.naturalWidth;
        m.h = img.naturalHeight;
        m.duration = 5;
        m.thumb = url;
      } else {
        const el = document.createElement(kind === "video" ? "video" : "audio");
        el.preload = "metadata";
        el.muted = true;
        el.src = url;
        await waitEvent(el, "loadedmetadata", 12000);
        if (!isFinite(el.duration)) {
          // ملفات webm المسجلة ساعات بتيجي من غير مدة
          el.currentTime = 1e7;
          await waitEvent(el, "durationchange", 4000).catch(() => {});
        }
        if (!isFinite(el.duration) || el.duration <= 0) throw new Error("duration");
        m.duration = el.duration;
        if (kind === "video") {
          m.w = el.videoWidth;
          m.h = el.videoHeight;
          m.thumb = await videoThumb(el);
        }
        m.peaks = await computePeaks(file, m.duration);
      }
    } catch (e) {
      URL.revokeObjectURL(url);
      throw new Error("المتصفح مقدرش يفتح الملف: " + file.name + " (ممكن الصيغة أو الكودك مش مدعوم)");
    }
    return S.addMedia(m);
  };

  // خلفية متدرجة جاهزة (علشان تجرب من غير ما ترفع ملفات)
  E.addGradient = function (name, c1, c2) {
    return new Promise((resolve, reject) => {
      const cv = document.createElement("canvas");
      cv.width = 1280;
      cv.height = 720;
      const g = cv.getContext("2d");
      const grad = g.createLinearGradient(0, 0, 1280, 720);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      g.fillStyle = grad;
      g.fillRect(0, 0, 1280, 720);
      cv.toBlob(async (blob) => {
        if (!blob) return reject(new Error("فشل إنشاء الخلفية"));
        try { resolve(await E.importFile(new File([blob], name + ".png", { type: "image/png" }))); }
        catch (e) { reject(e); }
      }, "image/png");
    });
  };

  /* ---------- التصدير ---------- */
  E.pickMime = function () {
    const list = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
    if (!window.MediaRecorder) return null;
    return list.find((m) => MediaRecorder.isTypeSupported(m)) || "";
  };

  E.exportVideo = async function (onProgress) {
    const dur = S.duration();
    if (dur <= 0) throw new Error("التايم لاين فاضي، ضيف مقاطع الأول.");
    if (!window.MediaRecorder || !canvas.captureStream) throw new Error("المتصفح ده مش بيدعم التصدير. استخدم Chrome أو Edge أو Firefox.");
    ensureAudio();
    if (actx && actx.state === "suspended") await actx.resume();
    E.pause();
    E.exporting = true;
    E.t = 0;
    let cancelled = false;
    let rec = null;
    let timer = null;
    try {
      await sleep(350); // نسيب أول فريم يترسم
      const stream = canvas.captureStream(30);
      if (recDest) recDest.stream.getAudioTracks().forEach((tk) => stream.addTrack(tk));
      const mime = E.pickMime();
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8000000 } : { videoBitsPerSecond: 8000000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((r) => (rec.onstop = r));
      E.cancelExport = () => {
        cancelled = true;
        E.pause();
        if (endedCb) { const cb = endedCb; endedCb = null; cb(); }
      };
      timer = setInterval(() => onProgress && onProgress(Math.min(1, E.t / dur)), 200);
      rec.start(500);
      await new Promise((res) => { endedCb = res; E.play(); });
      await sleep(350); // آخر فريم
      clearInterval(timer);
      rec.stop();
      await stopped;
      if (cancelled) throw new Error("cancelled");
      if (onProgress) onProgress(1);
      return new Blob(chunks, { type: ((rec.mimeType || mime || "video/webm") + "").split(";")[0] });
    } finally {
      if (timer) clearInterval(timer);
      if (rec && rec.state !== "inactive") { try { rec.stop(); } catch (e) { /* ignore */ } }
      E.exporting = false;
      E.cancelExport = null;
    }
  };
})();
