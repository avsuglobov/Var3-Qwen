#!/usr/bin/env python3
"""build_pdf_font.py — упаковывает локальные кириллические TTF (Liberation Sans)
в base64 и пишет download/pdf-font.js для jsPDF (addFileToVFS/addFont).
Liberation Sans содержит полный набор кириллицы — PDF с русским текстом корректен."""
import base64, os

FONTS = {
    "regular": "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "bold": "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
}
OUT = "/home/z/my-project/download/pdf-font.js"

parts = []
for name, path in FONTS.items():
    if not os.path.exists(path):
        raise SystemExit("font not found: " + path)
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    parts.append('  %s: "%s"' % (name, b64))
    print("%s: %d bytes -> base64 %d" % (name, os.path.getsize(path), len(b64)))

js = "/* Автогенерация build_pdf_font.py: Liberation Sans (кириллица) для jsPDF. Не редактируйте. */\n"
js += "window.AIWS_PDF_FONTS = {\n" + ",\n".join(parts) + "\n};\n"
with open(OUT, "w") as f:
    f.write(js)
print("wrote %s (%d bytes)" % (OUT, len(js)))
