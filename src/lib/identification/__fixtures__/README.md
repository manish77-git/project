# Identification fixtures

Everything here is **synthetic**. There is no real hospital document, no real
patient name, and no real bill number anywhere in this directory.

## `synthetic-bill.png` / `synthetic-bill.jpg`

Two encodings of the same invented bill, used by `npm run test:ocr` to prove the
pipeline works on real image bytes:

```
CITY GENERAL HOSPITAL
Bengaluru
Bill No: INV-2026-0042
Bill Date: 01-10-2026
Total Amount: Rs 15000
Insurance approved: Rs 5000
```

The last two lines are deliberate. They are protected figures that the
identification stage must read past and never return, so the integration test
can assert that a page *containing* amounts still produces a response without
them.

Both files were rendered once with Pillow's bundled **Aileron** font (public
domain, no third-party font licence) — chosen because a hand-made bitmap font is
not legible enough for an OCR shape model, and a real font is what a real bill
photo looks like:

```python
from PIL import Image, ImageDraw, ImageFont

LINES = [
    "CITY GENERAL HOSPITAL", "Bengaluru", "Bill No: INV-2026-0042",
    "Bill Date: 01-10-2026", "Total Amount: Rs 15000", "Insurance approved: Rs 5000",
]
font = ImageFont.load_default(size=44)          # Aileron, bundled with Pillow
img = Image.new("L", (1200, 560), 255)
draw = ImageDraw.Draw(img)
y = 40
for line in LINES:
    draw.text((50, y), line, fill=0, font=font)
    y += 72
ink = img.point(lambda v: 255 if v < 200 else 0)          # ink mask
box = ink.getbbox()
box = (max(0, box[0] - 24), max(0, box[1] - 24),
       min(img.width, box[2] + 24), min(img.height, box[3] + 24))
img = img.crop(box)
img.save("synthetic-bill.png")
img.save("synthetic-bill.jpg", format="JPEG", quality=85)
```

Measured with Tesseract 5 via `tesseract.js` 7 on 2026-10-16: both files read
back exactly, mean confidence 95. Regenerating with a different Pillow version or
font may change the bytes; if OCR output drifts, update the assertion in
`tests/ocr/real-ocr.test.ts` only after confirming the reading is genuinely
correct.

## Generated images (no committed files)

`../__fixtures__/synthetic-image.ts` draws images in memory instead: bitmap-font
text (good for "a valid, decodable image" but **not** reliable enough for
asserting OCR output), deterministic noise, and blank pages. Those cover the
unreadable-input paths without adding binary assets.
