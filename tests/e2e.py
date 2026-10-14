"""اختبار شامل في متصفح حقيقي (Playwright + Chromium).
التشغيل:  pip install playwright && playwright install chromium && python3 tests/e2e.py
"""
import subprocess, time, sys, os, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = tempfile.mkdtemp(prefix="cutly-e2e-")
srv = subprocess.Popen(["python3", "-m", "http.server", "8765", "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors, results = [], []
def check(name, ok, extra=""):
    results.append((name, ok)); print(("PASS " if ok else "FAIL ") + name + (" " + str(extra) if extra != "" else ""))

try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        ctx = b.new_context(viewport={"width": 1400, "height": 860}, accept_downloads=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console.error: " + m.text) if m.type == "error" and "fonts.g" not in m.text and "ERR_" not in m.text else None)
        page.goto("http://127.0.0.1:8765/index.html")
        page.wait_for_selector("#stage")

        count = lambda sel: page.locator(sel).count()
        check("الصفحة اتحملت والتايم لاين فيه ٤ مسارات", count(".tl-track") == 4, count(".tl-track"))

        page.click('.tab[data-tab="ready"]')
        page.locator("#gradPresets .preset").first.click()
        page.wait_for_selector(".clip-image", timeout=8000)
        check("خلفية جاهزة اتضافت كمقطع صورة", count(".clip-image") == 1)

        page.click('.tab[data-tab="text"]')
        page.locator("#textPresets .preset").nth(2).click()
        page.wait_for_selector(".clip-text")
        check("نص اتضاف على مسار النص", count(".clip-text") == 1)
        check("لوحة الخصائص ظهر فيها textarea للنص", count("textarea.txt") == 1)

        # تعديل النص من اللوحة
        page.fill("textarea.txt", "مرحبا Cutly")
        label = page.locator(".clip-text .clip-label").inner_text()
        check("تسمية مقطع النص اتحدثت", "مرحبا" in label, label)

        # slider: الحجم
        page.evaluate("""() => { const r=[...document.querySelectorAll('#inspector .row')].find(x=>x.textContent.includes('الحجم')).querySelector('input'); r.value=150; r.dispatchEvent(new Event('input',{bubbles:true})); r.dispatchEvent(new Event('change',{bubbles:true})); }""")
        sc = page.evaluate("() => { const s=Cutly.store; return s.find(s.state.selection).clip.props.scale; }")
        check("سلايدر الحجم غيّر الخاصية", sc == 150, sc)

        # قسّم الصورة
        page.locator(".clip-image").first.click()
        page.evaluate("() => Cutly.engine.seek(2)")
        page.click("#splitBtn")
        check("القسم عمل مقطعين صورة", count(".clip-image") == 2, count(".clip-image"))
        page.click("#undoBtn")
        check("التراجع رجّع مقطع واحد", count(".clip-image") == 1, count(".clip-image"))
        page.click("#redoBtn")
        check("الإعادة رجّعت القسم", count(".clip-image") == 2, count(".clip-image"))

        # تغيير الأبعاد
        page.select_option("#aspectSel", "9:16")
        wh = page.evaluate("() => [document.getElementById('stage').width, document.getElementById('stage').height]")
        check("أبعاد الكانفاس بقت 9:16", wh == [720, 1280], wh)
        page.select_option("#aspectSel", "16:9")

        # تشغيل
        page.evaluate("() => Cutly.engine.seek(0)")
        page.click("#playBtn")
        time.sleep(1.2)
        t = page.evaluate("() => Cutly.engine.t")
        check("التشغيل بيحرك الوقت", t > 0.5, round(t, 2))
        page.click("#playBtn")

        page.screenshot(path=OUT + "/editor.png")

        # تصدير
        dur = page.evaluate("() => Cutly.store.duration()")
        with page.expect_download(timeout=60000) as dl:
            page.click("#exportBtn")
        d = dl.value
        path = OUT + "/export-" + d.suggested_filename
        d.save_as(path)
        size = os.path.getsize(path)
        check("التصدير نزّل ملف فيديو", size > 5000, f"{d.suggested_filename} {size} bytes, timeline {dur:.1f}s")
        check("نافذة التصدير اتقفلت", page.locator("#exportModal").is_hidden())
        b.close()
finally:
    srv.terminate()

print("ملفات الاختبار في:", OUT)
print("--- errors:", errors if errors else "none")
bad = [n for n, ok in results if not ok]
print("\nالنتيجة:", len(results) - len(bad), "/", len(results))
sys.exit(1 if bad or errors else 0)
