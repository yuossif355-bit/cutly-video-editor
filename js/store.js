/* Cutly - حالة المشروع (المقاطع، المسارات، التراجع/الإعادة)
   الملف ده مفيهوش أي حاجة تخص المتصفح، عشان كده بيتختبر في Node. */
(function (root) {
  "use strict";

  const Cutly = (root.Cutly = root.Cutly || {});
  const MIN_DUR = 0.1;
  const ASPECTS = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [900, 900], "4:5": [720, 900] };

  let counter = 0;
  const uid = (p) => p + (++counter).toString(36) + Math.random().toString(36).slice(2, 6);
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

  /* ---------- خصائص افتراضية ---------- */
  function defaultProps(kind) {
    const base = { x: 0, y: 0, scale: 100, rotate: 0, opacity: 100, fadeIn: 0, fadeOut: 0 };
    if (kind === "text") {
      return Object.assign(base, {
        text: "اكتب هنا", fontSize: 64, color: "#ffffff", bold: true,
        stroke: true, strokeColor: "#000000", bgOn: false, bg: "#000000", bgOpacity: 70,
        font: "Cairo, Tajawal, Tahoma, Arial, sans-serif",
      });
    }
    if (kind === "audio") return { volume: 100, fadeIn: 0, fadeOut: 0 };
    return Object.assign(base, { volume: 100, brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0 });
  }

  function filterString(p, k) {
    k = k || 1;
    const f = [];
    if (p.brightness !== 100) f.push("brightness(" + p.brightness + "%)");
    if (p.contrast !== 100) f.push("contrast(" + p.contrast + "%)");
    if (p.saturate !== 100) f.push("saturate(" + p.saturate + "%)");
    if (p.hue) f.push("hue-rotate(" + p.hue + "deg)");
    if (p.blur > 0) f.push("blur(" + (p.blur * k).toFixed(2) + "px)");
    if (p.grayscale > 0) f.push("grayscale(" + p.grayscale + "%)");
    if (p.sepia > 0) f.push("sepia(" + p.sepia + "%)");
    return f.length ? f.join(" ") : "none";
  }

  function fmtTime(t) {
    t = Math.max(0, t || 0);
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return String(m).padStart(2, "0") + ":" + s.toFixed(1).padStart(4, "0");
  }

  const isMediaKind = (k) => k === "video" || k === "audio";
  const compatible = (trackKind, clipKind) =>
    trackKind === "text" ? clipKind === "text"
      : trackKind === "audio" ? clipKind === "audio"
      : clipKind === "video" || clipKind === "image";

  function defaultTracks() {
    return [
      { id: "t_text", kind: "text", name: "نص", clips: [] },
      { id: "t_v2", kind: "video", name: "طبقة", clips: [] },
      { id: "t_v1", kind: "video", name: "الرئيسي", clips: [] },
      { id: "t_a1", kind: "audio", name: "صوت", clips: [] },
    ];
  }

  /* ---------- المخزن ---------- */
  function createStore() {
    const state = { media: {}, tracks: defaultTracks(), settings: { aspect: "16:9", bg: "#000000" }, selection: null };
    const listeners = [];
    let undoStack = [];
    let redoStack = [];
    const store = { state, ASPECTS, MIN_DUR, uid, compatible, defaultProps };

    store.on = (fn) => listeners.push(fn);
    store.emit = (why) => listeners.forEach((fn) => fn(why || "change"));

    const snapshot = () => JSON.stringify({ tracks: state.tracks, settings: state.settings });
    const sortTrack = (tr) => tr.clips.sort((a, b) => a.start - b.start);

    store.checkpoint = () => {
      const s = snapshot();
      if (undoStack[undoStack.length - 1] !== s) undoStack.push(s);
      if (undoStack.length > 100) undoStack.shift();
      redoStack = [];
    };
    store.beginEdit = store.checkpoint;

    function restore(json) {
      const o = JSON.parse(json);
      state.tracks = o.tracks;
      state.settings = o.settings;
      if (state.selection && !store.find(state.selection)) state.selection = null;
      store.emit("change");
    }
    store.undo = () => {
      if (!undoStack.length) return false;
      redoStack.push(snapshot());
      restore(undoStack.pop());
      return true;
    };
    store.redo = () => {
      if (!redoStack.length) return false;
      undoStack.push(snapshot());
      restore(redoStack.pop());
      return true;
    };
    store.canUndo = () => undoStack.length > 0;
    store.canRedo = () => redoStack.length > 0;

    /* ---------- استعلامات ---------- */
    store.duration = () => {
      let d = 0;
      for (const tr of state.tracks) for (const c of tr.clips) d = Math.max(d, c.start + c.dur);
      return d;
    };
    store.find = (id) => {
      for (const tr of state.tracks) {
        const c = tr.clips.find((x) => x.id === id);
        if (c) return { clip: c, track: tr };
      }
      return null;
    };
    store.getTrack = (id) => state.tracks.find((t) => t.id === id) || null;
    store.hasClips = () => state.tracks.some((t) => t.clips.length > 0);

    store.select = (id) => {
      if (state.selection === id) return;
      state.selection = id || null;
      store.emit("selection");
    };

    /* ---------- الوسائط ---------- */
    store.addMedia = (m) => { state.media[m.id] = m; store.emit("media"); return m; };
    store.removeMedia = (id) => {
      store.checkpoint();
      for (const tr of state.tracks) tr.clips = tr.clips.filter((c) => c.mediaId !== id);
      delete state.media[id];
      if (state.selection && !store.find(state.selection)) state.selection = null;
      store.emit("change");
      store.emit("media");
    };

    /* ---------- أقرب مكان فاضي لمقطع ---------- */
    store.resolveStart = (track, dur, desired, ignoreId) => {
      const others = track.clips.filter((c) => c.id !== ignoreId).sort((a, b) => a.start - b.start);
      desired = Math.max(0, desired || 0);
      const gaps = [];
      let cursor = 0;
      for (const o of others) {
        if (o.start - cursor >= dur - 1e-6) gaps.push([cursor, o.start]);
        cursor = Math.max(cursor, o.start + o.dur);
      }
      gaps.push([cursor, Infinity]);
      let best = 0, bestD = Infinity;
      for (const [a, b] of gaps) {
        const hi = b - dur;
        if (hi < a - 1e-9) continue;
        const s = Math.min(Math.max(desired, a), hi);
        const d = Math.abs(s - desired);
        if (d < bestD - 1e-9) { best = s; bestD = d; }
      }
      return best;
    };

    /* ---------- إضافة مقاطع ---------- */
    store.addClipFromMedia = (mediaId, opts) => {
      opts = opts || {};
      const m = state.media[mediaId];
      if (!m) return null;
      let track = opts.trackId ? store.getTrack(opts.trackId) : null;
      if (track && !compatible(track.kind, m.kind)) track = null;
      if (!track) track = store.getTrack(m.kind === "audio" ? "t_a1" : "t_v1");
      const dur = m.kind === "image" ? 5 : Math.max(m.duration || 0, MIN_DUR);
      store.checkpoint();
      const clip = {
        id: uid("c_"), mediaId, kind: m.kind,
        start: store.resolveStart(track, dur, opts.start || 0),
        dur, in: 0, speed: 1, props: defaultProps(m.kind),
      };
      track.clips.push(clip);
      sortTrack(track);
      state.selection = clip.id;
      store.emit("change");
      return clip;
    };

    store.addText = (patch, start, dur) => {
      const track = store.getTrack("t_text");
      dur = dur || 3;
      store.checkpoint();
      const clip = {
        id: uid("c_"), mediaId: null, kind: "text",
        start: store.resolveStart(track, dur, start || 0),
        dur, in: 0, speed: 1, props: Object.assign(defaultProps("text"), patch || {}),
      };
      track.clips.push(clip);
      sortTrack(track);
      state.selection = clip.id;
      store.emit("change");
      return clip;
    };

    /* ---------- تعديل ---------- */
    store.setProps = (id, patch, live) => {
      const f = store.find(id);
      if (!f) return false;
      if (!live) store.checkpoint();
      Object.assign(f.clip.props, patch);
      store.emit("props");
      return true;
    };

    store.moveClip = (id, newStart, trackId) => {
      const f = store.find(id);
      if (!f) return false;
      let tr = f.track;
      if (trackId && trackId !== tr.id) {
        const t2 = store.getTrack(trackId);
        if (t2 && compatible(t2.kind, f.clip.kind)) tr = t2;
      }
      const s = store.resolveStart(tr, f.clip.dur, newStart, id);
      if (tr === f.track && Math.abs(s - f.clip.start) < 1e-6) return false;
      store.checkpoint();
      if (tr !== f.track) {
        f.track.clips = f.track.clips.filter((c) => c !== f.clip);
        tr.clips.push(f.clip);
      }
      f.clip.start = s;
      sortTrack(tr);
      store.emit("change");
      return true;
    };

    store.clampTrimLeft = (clip, tr, newStart) => {
      let min = 0;
      for (const c of tr.clips) if (c !== clip && c.start + c.dur <= clip.start + 1e-6) min = Math.max(min, c.start + c.dur);
      if (isMediaKind(clip.kind)) min = Math.max(min, clip.start - clip.in / clip.speed);
      const max = clip.start + clip.dur - MIN_DUR;
      return Math.min(Math.max(newStart, min), max);
    };
    store.clampTrimRight = (clip, tr, newEnd) => {
      let max = Infinity;
      for (const c of tr.clips) if (c !== clip && c.start >= clip.start + clip.dur - 1e-6) max = Math.min(max, c.start);
      if (isMediaKind(clip.kind)) {
        const m = state.media[clip.mediaId];
        if (m && isFinite(m.duration)) max = Math.min(max, clip.start + (m.duration - clip.in) / clip.speed);
      }
      const min = clip.start + MIN_DUR;
      return Math.min(Math.max(newEnd, min), max);
    };

    store.trimLeft = (id, newStart) => {
      const f = store.find(id);
      if (!f) return false;
      const c = f.clip;
      const s = store.clampTrimLeft(c, f.track, newStart);
      const dt = s - c.start;
      if (Math.abs(dt) < 1e-6) return false;
      store.checkpoint();
      if (isMediaKind(c.kind)) c.in = Math.max(0, c.in + dt * c.speed);
      c.dur -= dt;
      c.start = s;
      store.emit("change");
      return true;
    };
    store.trimRight = (id, newEnd) => {
      const f = store.find(id);
      if (!f) return false;
      const c = f.clip;
      const e = store.clampTrimRight(c, f.track, newEnd);
      if (Math.abs(e - (c.start + c.dur)) < 1e-6) return false;
      store.checkpoint();
      c.dur = e - c.start;
      store.emit("change");
      return true;
    };

    store.split = (id, t) => {
      const f = store.find(id);
      if (!f) return null;
      const c = f.clip;
      if (!(t > c.start + MIN_DUR && t < c.start + c.dur - MIN_DUR)) return null;
      store.checkpoint();
      const right = JSON.parse(JSON.stringify(c));
      right.id = uid("c_");
      const leftDur = t - c.start;
      right.start = t;
      right.dur = c.dur - leftDur;
      if (isMediaKind(c.kind)) right.in = c.in + leftDur * c.speed;
      c.dur = leftDur;
      c.props.fadeOut = 0;
      right.props.fadeIn = 0;
      f.track.clips.push(right);
      sortTrack(f.track);
      state.selection = right.id;
      store.emit("change");
      return right.id;
    };

    store.splitAtTime = (t) => {
      // لو فيه مقطع متحدد بنقسمه، وإلا بنقسم كل المقاطع تحت المؤشر
      const ids = [];
      if (state.selection) {
        const f = store.find(state.selection);
        if (f) ids.push(f.clip.id);
      } else {
        for (const tr of state.tracks) for (const c of tr.clips) if (t > c.start && t < c.start + c.dur) ids.push(c.id);
      }
      let n = 0;
      for (const id of ids) if (store.split(id, t)) n++;
      return n;
    };

    store.deleteClip = (id) => {
      const f = store.find(id);
      if (!f) return false;
      store.checkpoint();
      f.track.clips = f.track.clips.filter((c) => c !== f.clip);
      if (state.selection === id) state.selection = null;
      store.emit("change");
      return true;
    };

    store.duplicate = (id) => {
      const f = store.find(id);
      if (!f) return null;
      store.checkpoint();
      const c = JSON.parse(JSON.stringify(f.clip));
      c.id = uid("c_");
      c.start = store.resolveStart(f.track, c.dur, f.clip.start + f.clip.dur);
      f.track.clips.push(c);
      sortTrack(f.track);
      state.selection = c.id;
      store.emit("change");
      return c.id;
    };

    // السرعة بتغير مدة المقطع. لو مفيش مكان قبل المقطع اللي بعده بنرفض التغيير.
    store.setSpeed = (id, speed, live) => {
      const f = store.find(id);
      if (!f || !isMediaKind(f.clip.kind)) return false;
      const c = f.clip;
      speed = clamp(speed, 0.25, 4);
      const newDur = (c.dur * c.speed) / speed;
      let nextStart = Infinity;
      for (const o of f.track.clips) if (o !== c && o.start >= c.start + c.dur - 1e-6) nextStart = Math.min(nextStart, o.start);
      if (c.start + newDur > nextStart + 1e-6) return false;
      if (!live) store.checkpoint();
      c.dur = newDur;
      c.speed = speed;
      store.emit("change");
      return true;
    };

    store.setAspect = (a) => {
      if (!ASPECTS[a] || state.settings.aspect === a) return;
      store.checkpoint();
      state.settings.aspect = a;
      store.emit("change");
    };
    store.setBg = (color, live) => {
      if (!live) store.checkpoint();
      state.settings.bg = color;
      store.emit("props");
    };

    store.reset = () => {
      state.tracks = defaultTracks();
      state.settings = { aspect: "16:9", bg: "#000000" };
      state.selection = null;
      undoStack = [];
      redoStack = [];
      store.emit("change");
    };

    return store;
  }

  Cutly.createStore = createStore;
  Cutly.store = createStore();
  Cutly.util = { clamp, fmtTime, filterString, defaultProps, isMediaKind };

  if (typeof module !== "undefined" && module.exports) module.exports = Cutly;
})(typeof window !== "undefined" ? window : globalThis);
