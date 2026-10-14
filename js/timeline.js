/* Cutly - التايم لاين: مسارات، مقاطع بالسحب والقص، مؤشر التشغيل، التكبير */
(function () {
  "use strict";

  const C = window.Cutly;
  const S = C.store;
  const { fmtTime } = C.util;
  const T = (C.timeline = { pps: 60, snap: true });

  const ICONS = { text: "T", video: "🎞", audio: "🎵" };
  let scroll, inner, ruler, tracksEl, labelsEl, playhead, hint;

  const el = (tag, cls, parent) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  };

  T.init = function () {
    scroll = document.getElementById("tlScroll");
    labelsEl = document.getElementById("tlLabels");
    inner = el("div", "tl-inner", scroll);
    ruler = el("div", "tl-ruler", inner);
    tracksEl = el("div", "tl-tracks", inner);
    playhead = el("div", "tl-playhead", inner);
    el("div", "tl-playhead-knob", playhead);
    hint = el("div", "tl-hint", inner);
    hint.textContent = "ضيف ملفات من المكتبة بزرار + أو اسحبها هنا";

    bindRuler();
    bindTracks();

    S.on((why) => {
      if (why === "selection") updateSelection();
      else if (why === "change" || why === "media") T.render();
    });
    T.render();
  };

  /* ---------- الرسم ---------- */
  T.render = function () {
    const dur = Math.max(S.duration(), 10);
    const width = Math.max((dur + 8) * T.pps, scroll.clientWidth);
    inner.style.width = width + "px";
    renderRuler(width);

    tracksEl.innerHTML = "";
    labelsEl.innerHTML = "";
    const spacer = el("div", "tl-label-spacer", labelsEl);
    spacer.textContent = "";
    for (const tr of S.state.tracks) {
      const lab = el("div", "tl-label tl-label-" + tr.kind, labelsEl);
      lab.textContent = ICONS[tr.kind];
      lab.title = tr.name;

      const row = el("div", "tl-track tl-track-" + tr.kind, tracksEl);
      row.dataset.track = tr.id;
      row.dataset.kind = tr.kind;
      for (const c of tr.clips) row.appendChild(clipEl(c, tr));
    }
    hint.style.display = S.hasClips() ? "none" : "block";
    updatePlayhead(C.engine.t);
  };

  function renderRuler(width) {
    ruler.innerHTML = "";
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const step = steps.find((s) => s * T.pps >= 80) || 900;
    const count = Math.ceil(width / (step * T.pps));
    for (let i = 0; i <= count; i++) {
      const t = i * step;
      const tick = el("div", "tl-tick", ruler);
      tick.style.left = t * T.pps + "px";
      const m = Math.floor(t / 60);
      const s = t - m * 60;
      tick.textContent = step < 1 ? m + ":" + s.toFixed(1).padStart(4, "0") : m + ":" + String(Math.round(s)).padStart(2, "0");
    }
  }

  function clipEl(c, tr) {
    const e = el("div", "clip clip-" + c.kind + (S.state.selection === c.id ? " selected" : ""));
    e.dataset.id = c.id;
    e.style.left = c.start * T.pps + "px";
    e.style.width = Math.max(c.dur * T.pps, 6) + "px";
    const m = c.mediaId ? S.state.media[c.mediaId] : null;

    if (m && m.thumb && c.kind !== "audio") {
      const bg = el("div", "clip-bg", e);
      bg.style.backgroundImage = "url(" + m.thumb + ")";
    }
    if (c.kind === "audio" && m && m.peaks) {
      const cv = el("canvas", "wave", e);
      drawWave(cv, c, m);
    }
    const label = el("span", "clip-label", e);
    if (c.kind === "text") label.textContent = String(c.props.text || "").split("\n")[0];
    else label.textContent = (m ? m.name : "") + (c.speed !== 1 ? "  ×" + c.speed.toFixed(2).replace(/\.?0+$/, "") : "");
    el("div", "handle hl", e);
    el("div", "handle hr", e);

    e.addEventListener("pointerdown", (ev) => {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      ev.stopPropagation();
      S.select(c.id);
      const mode = ev.target.classList.contains("hl") ? "trimL" : ev.target.classList.contains("hr") ? "trimR" : "move";
      startDrag(ev, e, c.id, mode);
    });
    return e;
  }

  function drawWave(cv, c, m) {
    const w = Math.min(Math.max(Math.round(c.dur * T.pps), 4), 4000);
    const h = 40;
    cv.width = w;
    cv.height = h;
    const g = cv.getContext("2d");
    if (!g) return;
    g.fillStyle = "rgba(255,255,255,.75)";
    const perSec = m.peaks.length / m.duration;
    for (let x = 0; x < w; x += 2) {
      const srcT = c.in + (x / w) * c.dur * c.speed;
      const v = m.peaks[Math.min(m.peaks.length - 1, Math.floor(srcT * perSec))] || 0;
      const bh = Math.max(2, Math.min(1, v * 1.6) * h);
      g.fillRect(x, (h - bh) / 2, 1.5, bh);
    }
  }

  function updateSelection() {
    const sel = S.state.selection;
    tracksEl.querySelectorAll(".clip").forEach((n) => n.classList.toggle("selected", n.dataset.id === sel));
  }

  /* ---------- المؤشر ---------- */
  function updatePlayhead(t) {
    playhead.style.left = t * T.pps + "px";
  }
  T.onTime = function (t) {
    updatePlayhead(t);
    if (C.engine.playing) {
      const x = t * T.pps;
      if (x > scroll.scrollLeft + scroll.clientWidth - 50 || x < scroll.scrollLeft) scroll.scrollLeft = Math.max(0, x - 60);
    }
  };

  T.setZoom = function (pps) {
    const center = (scroll.scrollLeft + scroll.clientWidth / 2) / T.pps;
    T.pps = pps;
    T.render();
    scroll.scrollLeft = Math.max(0, center * T.pps - scroll.clientWidth / 2);
  };

  function bindRuler() {
    ruler.style.touchAction = "none";
    ruler.addEventListener("pointerdown", (e) => {
      ruler.setPointerCapture(e.pointerId);
      const seek = (ev) => C.engine.seek((ev.clientX - inner.getBoundingClientRect().left) / T.pps);
      seek(e);
      const mv = (ev) => seek(ev);
      const up = () => {
        ruler.removeEventListener("pointermove", mv);
        ruler.removeEventListener("pointerup", up);
        ruler.removeEventListener("pointercancel", up);
      };
      ruler.addEventListener("pointermove", mv);
      ruler.addEventListener("pointerup", up);
      ruler.addEventListener("pointercancel", up);
    });
  }

  /* ---------- السحب والقص ---------- */
  function snapPoints(excludeId) {
    const pts = [0, C.engine.t];
    for (const tr of S.state.tracks) for (const c of tr.clips) if (c.id !== excludeId) pts.push(c.start, c.start + c.dur);
    return pts;
  }
  function snapValue(v, pts) {
    if (!T.snap) return v;
    const th = 8 / T.pps;
    let best = v, bd = th;
    for (const p of pts) { const d = Math.abs(p - v); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function snapMove(start, dur, pts) {
    if (!T.snap) return start;
    const th = 8 / T.pps;
    let best = start, bd = th;
    for (const p of pts) {
      const d1 = Math.abs(p - start);
      if (d1 < bd) { bd = d1; best = p; }
      const d2 = Math.abs(p - (start + dur));
      if (d2 < bd) { bd = d2; best = p - dur; }
    }
    return best;
  }

  function rowAtY(clientY) {
    for (const row of tracksEl.children) {
      const r = row.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) return row;
    }
    return null;
  }

  function startDrag(e, node, id, mode) {
    const f = S.find(id);
    if (!f) return;
    const c = f.clip;
    const tr = f.track;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start0 = c.start;
    const dur0 = c.dur;
    const pts = snapPoints(id);
    let moved = false;
    let pending = null;
    try { node.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

    const clearHover = () => tracksEl.querySelectorAll(".tl-track.drop-ok").forEach((n) => n.classList.remove("drop-ok"));

    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - x0) < 4 && Math.abs(ev.clientY - y0) < 4) return;
      if (!moved) { moved = true; node.classList.add("dragging"); }
      const dx = (ev.clientX - x0) / T.pps;
      if (mode === "move") {
        const ns = Math.max(0, snapMove(start0 + dx, dur0, pts));
        node.style.left = ns * T.pps + "px";
        node.style.transform = "translateY(" + (ev.clientY - y0) + "px)";
        const row = rowAtY(ev.clientY);
        clearHover();
        let trackId = tr.id;
        if (row && S.compatible(row.dataset.kind, c.kind)) { trackId = row.dataset.track; row.classList.add("drop-ok"); }
        pending = { start: ns, trackId };
      } else if (mode === "trimL") {
        const ns = S.clampTrimLeft(c, tr, snapValue(start0 + dx, pts));
        node.style.left = ns * T.pps + "px";
        node.style.width = Math.max((start0 + dur0 - ns) * T.pps, 6) + "px";
        pending = { start: ns };
      } else {
        const ne = S.clampTrimRight(c, tr, snapValue(start0 + dur0 + dx, pts));
        node.style.width = Math.max((ne - start0) * T.pps, 6) + "px";
        pending = { end: ne };
      }
    };
    const up = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
      clearHover();
      if (!moved || !pending) return;
      let changed = false;
      if (mode === "move") changed = S.moveClip(id, pending.start, pending.trackId);
      else if (mode === "trimL") changed = S.trimLeft(id, pending.start);
      else changed = S.trimRight(id, pending.end);
      if (!changed) T.render(); // رجّع الشكل القديم لو مفيش تغيير
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
  }

  /* ---------- نقر المساحة الفاضية + إسقاط الملفات ---------- */
  function bindTracks() {
    tracksEl.addEventListener("pointerdown", (e) => {
      if (e.target.classList.contains("tl-track")) S.select(null);
    });
    tracksEl.addEventListener("dragover", (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("text/cutly-media")) e.preventDefault();
    });
    tracksEl.addEventListener("drop", (e) => {
      const id = e.dataTransfer && e.dataTransfer.getData("text/cutly-media");
      if (!id) return;
      e.preventDefault();
      const row = e.target.closest ? e.target.closest(".tl-track") : null;
      const t = (e.clientX - inner.getBoundingClientRect().left) / T.pps;
      S.addClipFromMedia(id, { start: t, trackId: row ? row.dataset.track : null });
    });
  }

  T.fmt = fmtTime;
})();
