#!/usr/bin/env python3
"""把 make-social.mjs 生成的 HTML 版式截成 PNG。

用法（由 Node 调用，一般不用手动跑）：
    python3 scripts/social/shot.py jobs.json

jobs.json: {"jobs":[{"html":..., "out":..., "width":1242, "height":1656, "scale":1}]}
scale < 1 时同时缩小输出像素（微信版 1242→1080，版式不变）。
"""

import json
import sys
from pathlib import Path


def fail(message: str) -> int:
    print(message, file=sys.stderr)
    return 1


def main() -> int:
    if len(sys.argv) < 2:
        return fail("用法：python3 scripts/social/shot.py jobs.json")

    manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    jobs = manifest.get("jobs") or []
    if not jobs:
        return fail("jobs.json 里没有任务")

    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return fail(
            "缺少 Playwright。先运行：\n"
            "  python3 -m pip install playwright\n"
            "  python3 -m playwright install chromium"
        )

    with sync_playwright() as p:
        browser = p.chromium.launch()
        for index, job in enumerate(jobs, 1):
            html = Path(job["html"]).resolve()
            out = Path(job["out"])
            out.parent.mkdir(parents=True, exist_ok=True)

            context = browser.new_context(
                viewport={"width": int(job["width"]), "height": int(job["height"])},
                device_scale_factor=float(job.get("scale", 1)),
                color_scheme="light",
                reduced_motion="reduce",
            )
            page = context.new_page()
            page.goto(html.as_uri(), wait_until="load")
            page.evaluate("async () => { await document.fonts.ready; }")
            page.wait_for_timeout(160)
            page.screenshot(path=str(out), full_page=False)
            context.close()
            print(f"  [{index}/{len(jobs)}] {out.name}")

        browser.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
