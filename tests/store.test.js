// تشغيل: node tests/store.test.js
const assert = require("assert");
const { createStore } = require("../js/store.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  -", name); }
  catch (e) { console.error("FAIL -", name, "\n     ", e.message); process.exitCode = 1; }
}
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, (m || "") + " expected " + b + " got " + a);

function setup() {
  const s = createStore();
  s.addMedia({ id: "v1", name: "a.mp4", kind: "video", duration: 10 });
  s.addMedia({ id: "v2", name: "b.mp4", kind: "video", duration: 6 });
  s.addMedia({ id: "i1", name: "p.png", kind: "image", duration: 5 });
  s.addMedia({ id: "a1", name: "s.mp3", kind: "audio", duration: 30 });
  return s;
}

test("إضافة فيديو بيروح المسار الرئيسي ويتحدد", () => {
  const s = setup();
  const c = s.addClipFromMedia("v1", { start: 0 });
  assert.strictEqual(s.find(c.id).track.id, "t_v1");
  near(c.dur, 10);
  assert.strictEqual(s.state.selection, c.id);
});

test("المقطع التاني بيتحط بعد الأول مش فوقه", () => {
  const s = setup();
  s.addClipFromMedia("v1", { start: 0 });
  const c2 = s.addClipFromMedia("v2", { start: 0 });
  near(c2.start, 10);
  near(s.duration(), 16);
});

test("الصورة مدتها ٥ ثواني والصوت بيروح مسار الصوت", () => {
  const s = setup();
  near(s.addClipFromMedia("i1").dur, 5);
  assert.strictEqual(s.find(s.addClipFromMedia("a1").id).track.id, "t_a1");
});

test("resolveStart بيختار أقرب فجوة تكفي", () => {
  const s = setup();
  const tr = s.getTrack("t_v1");
  tr.clips.push({ id: "x", start: 0, dur: 5 }, { id: "y", start: 7, dur: 3 });
  near(s.resolveStart(tr, 2, 5), 5, "داخل الفجوة 5..7");
  near(s.resolveStart(tr, 2, 6), 5, "بيتزحلق لآخر الفجوة");
  near(s.resolveStart(tr, 4, 5), 10, "الفجوة صغيرة فبيروح بعد الأخير");
  near(s.resolveStart(tr, 2, 1), 5, "فوق مقطع موجود");
});

test("القص بيقسم المقطع ويحسب نقطة البداية في المصدر", () => {
  const s = setup();
  const c = s.addClipFromMedia("v1", { start: 0 });
  const rid = s.split(c.id, 4);
  const right = s.find(rid).clip;
  near(c.dur, 4);
  near(right.start, 4);
  near(right.dur, 6);
  near(right.in, 4);
  assert.strictEqual(s.getTrack("t_v1").clips.length, 2);
});

test("القص مبيشتغلش قرب الحافة", () => {
  const s = setup();
  const c = s.addClipFromMedia("v1", { start: 0 });
  assert.strictEqual(s.split(c.id, 0.05), null);
  assert.strictEqual(s.split(c.id, 9.98), null);
});

test("التراجع والإعادة بيرجعوا القص", () => {
  const s = setup();
  const c = s.addClipFromMedia("v1", { start: 0 });
  s.split(c.id, 4);
  assert.strictEqual(s.getTrack("t_v1").clips.length, 2);
  assert.ok(s.undo());
  assert.strictEqual(s.getTrack("t_v1").clips.length, 1);
  assert.ok(s.redo());
  assert.strictEqual(s.getTrack("t_v1").clips.length, 2);
});

test("trimRight مبيعديش طول الملف الأصلي", () => {
  const s = setup();
  const c = s.addClipFromMedia("v2", { start: 0 });
  s.trimRight(c.id, 3);
  near(c.dur, 3);
  s.trimRight(c.id, 50);
  near(c.dur, 6, "رجع لآخر الملف بالظبط");
});

test("trimLeft بيحرك نقطة البداية في المصدر", () => {
  const s = setup();
  const c = s.addClipFromMedia("v1", { start: 2 });
  s.trimLeft(c.id, 5);
  near(c.start, 5);
  near(c.dur, 7);
  near(c.in, 3);
  s.trimLeft(c.id, 0);
  near(c.in, 0, "مينفعش in يبقى سالب");
  near(c.start, 2);
});

test("trimLeft مبيدخلش في المقطع اللي قبله", () => {
  const s = setup();
  s.addClipFromMedia("v1", { start: 0 });
  const c2 = s.addClipFromMedia("i1", { start: 10 });
  s.trimLeft(c2.id, 3);
  near(c2.start, 10);
});

test("السرعة بتغير المدة", () => {
  const s = setup();
  const c = s.addClipFromMedia("v1", { start: 0 });
  assert.ok(s.setSpeed(c.id, 2));
  near(c.dur, 5);
  near(c.speed, 2);
  assert.ok(s.setSpeed(c.id, 0.5));
  near(c.dur, 20);
});

test("السرعة بتترفض لو هتخبط في المقطع اللي بعده", () => {
  const s = setup();
  const c = s.addClipFromMedia("v1", { start: 0 });
  s.addClipFromMedia("v2", { start: 10 });
  assert.strictEqual(s.setSpeed(c.id, 0.5), false);
  near(c.dur, 10);
});

test("نقل مقطع لمسار تاني متوافق وفوق مقطع بيتزحلق", () => {
  const s = setup();
  const c = s.addClipFromMedia("v1", { start: 0 });
  assert.ok(s.moveClip(c.id, 3, "t_v2"));
  assert.strictEqual(s.find(c.id).track.id, "t_v2");
  near(c.start, 3);
  s.moveClip(c.id, 1, "t_text");
  assert.strictEqual(s.find(c.id).track.id, "t_v2", "مسار النص مش متوافق");
});

test("النص بيتضاف على مسار النص ويتكرر بدون تداخل", () => {
  const s = setup();
  const t1 = s.addText({ text: "أ" }, 0, 3);
  const t2 = s.addText({ text: "ب" }, 1, 3);
  assert.strictEqual(s.find(t1.id).track.id, "t_text");
  near(t2.start, 3);
});

test("التكرار (duplicate) بيحط النسخة بعد الأصل", () => {
  const s = setup();
  const c = s.addClipFromMedia("i1", { start: 0 });
  const id = s.duplicate(c.id);
  near(s.find(id).clip.start, 5);
  assert.notStrictEqual(id, c.id);
});

test("الحذف والتحديد", () => {
  const s = setup();
  const c = s.addClipFromMedia("i1", { start: 0 });
  assert.ok(s.deleteClip(c.id));
  assert.strictEqual(s.state.selection, null);
  assert.strictEqual(s.hasClips(), false);
});

test("splitAtTime من غير تحديد بيقسم كل اللي تحت المؤشر", () => {
  const s = setup();
  s.addClipFromMedia("v1", { start: 0 });
  s.addText({}, 0, 8);
  s.state.selection = null;
  assert.strictEqual(s.splitAtTime(4), 2);
});

test("تغيير الخصائص الحية مبيعملش نقطة تراجع جديدة", () => {
  const s = setup();
  const c = s.addClipFromMedia("i1", { start: 0 });
  s.beginEdit();
  s.setProps(c.id, { scale: 120 }, true);
  s.setProps(c.id, { scale: 130 }, true);
  near(c.props.scale, 130);
  s.undo();
  near(s.find(c.id).clip.props.scale, 100);
});

test("تغيير نسبة العرض بيتسجل في التاريخ", () => {
  const s = setup();
  s.setAspect("9:16");
  assert.strictEqual(s.state.settings.aspect, "9:16");
  s.undo();
  assert.strictEqual(s.state.settings.aspect, "16:9");
});

test("حذف ملف من المكتبة بيشيل مقاطعه", () => {
  const s = setup();
  s.addClipFromMedia("v1", { start: 0 });
  s.addClipFromMedia("v2", { start: 0 });
  s.removeMedia("v1");
  assert.strictEqual(s.getTrack("t_v1").clips.length, 1);
  assert.strictEqual(s.state.media.v1, undefined);
});

console.log("\n" + passed + " اختبار نجحوا" + (process.exitCode ? " (وفيه فشل)" : ""));
