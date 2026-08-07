#!/usr/bin/env python3
"""
Build artifact.html from index.html.

The Artifact host supplies its own <!doctype>/<html>/<head>/<body> shell and
enforces a strict CSP that blocks every external request, so the deployable
page cannot be published as-is. This produces the variant that can:

  * unwraps the document (the host provides the shell)
  * inlines the four webfonts as base64 woff2 (no fonts.googleapis.com)
  * inlines every local photo (photos/*.jpg) as a base64 data: URI, since
    the published artifact cannot fetch same-origin files either
  * re-asserts the viewport meta, which is otherwise lost with the <head>

Regenerate with:  python3 build-artifact.py
"""

import base64
import pathlib
import re
import sys
import urllib.request

HERE = pathlib.Path(__file__).parent
SRC = HERE / "index.html"
OUT = HERE / "artifact.html"

GOOGLE_FONTS = (
    "https://fonts.googleapis.com/css2"
    "?family=Cinzel:wght@400;500;600"
    "&family=Playfair+Display:ital,wght@0,400;0,700;1,400"
    "&family=Pinyon+Script"
    "&family=Lora:wght@400;500"
    "&display=swap"
)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

# Without this the host's shell decides the viewport. If it omits the tag,
# phones lay the page out at ~980px and scale it down, which silently undoes
# every mobile breakpoint in the stylesheet.
VIEWPORT_SHIM = """<script>
/* The host shell owns <head>. Make sure the page is still laid out at device
   width if it did not supply a viewport tag; a no-op when it did. */
(function(){
  if (document.querySelector('meta[name="viewport"]')) return;
  var m = document.createElement('meta');
  m.name = 'viewport';
  m.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  document.head.appendChild(m);
})();
</script>"""


def fetch(url, **headers):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **headers})
    return urllib.request.urlopen(req, timeout=60).read()


def inline_fonts():
    """Latin-subset woff2 for each face, base64'd into @font-face rules."""
    css = fetch(GOOGLE_FONTS).decode()
    # Google emits each face preceded by a /* subset */ comment.
    parts = re.split(r"/\*\s*([a-z0-9\-\[\]]+)\s*\*/", css)
    blocks, total = [], 0

    for name, block in zip(parts[1::2], parts[2::2]):
        if name != "latin":
            continue
        m = re.search(r"url\((https://[^)]+\.woff2)\)", block)
        if not m:
            continue
        data = fetch(m.group(1))
        total += len(data)
        b64 = base64.b64encode(data).decode()
        block = block.replace(m.group(0), f"url(data:font/woff2;base64,{b64})")
        blocks.append(block.strip())

    if not blocks:
        sys.exit("no latin faces resolved from Google Fonts")

    print(f"  inlined {len(blocks)} faces, {total // 1024} KB of woff2")
    return "\n".join(blocks)


def inline_photos(body):
    """<img src="photos/foo.jpg"> -> <img src="data:image/jpeg;base64,...">"""
    total = 0

    def replace(m):
        nonlocal total
        rel = m.group(1)
        path = HERE / rel
        if not path.is_file():
            sys.exit(f"referenced photo missing on disk: {rel}")
        data = path.read_bytes()
        total += len(data)
        b64 = base64.b64encode(data).decode()
        return f'src="data:image/jpeg;base64,{b64}"'

    body, n = re.subn(r'src="(photos/[^"]+\.jpg)"', replace, body)
    if n:
        print(f"  inlined {n} photos, {total // 1024} KB of jpeg")
    return body


def main():
    src = SRC.read_text()

    def grab(pattern, what):
        m = re.search(pattern, src, re.S)
        if not m:
            sys.exit(f"could not find {what} in {SRC.name}")
        return m

    title = grab(r"<title>.*?</title>", "<title>").group(0)
    style = grab(r"<style>.*?</style>", "<style>").group(0)
    body = grab(r"<body[^>]*>(.*)</body>", "<body>").group(1)

    style = style.replace(
        "<style>",
        "<style>\n/* --- inlined webfonts (artifact CSP blocks external requests) --- */\n"
        + inline_fonts()
        + "\n",
        1,
    )

    body = inline_photos(body)

    OUT.write_text(
        "\n".join([title, VIEWPORT_SHIM, style, body.strip(), ""])
    )
    print(f"  wrote {OUT.name} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
