import fitz
import os
import io
from PIL import Image

pdf_path = os.path.join("docs", "03-design", "Hanos Cards (Twitter Post) (1).pdf")
target_dir = os.path.join("public", "share", "hero")
os.makedirs(target_dir, exist_ok=True)

doc = fitz.open(pdf_path)
hero_xrefs = {
    "hero-star.png": 40,
    "hero-planet.png": 56,
    "hero-dwarf.png": 77,
    "hero-galaxy.png": 96,
    "hero-boundaries.png": 116,
}

for name, xref in hero_xrefs.items():
    base_img = doc.extract_image(xref)
    im = Image.open(io.BytesIO(base_img["image"]))
    out_path = os.path.join(target_dir, name)
    im.save(out_path, "PNG")
    print(f"Saved {out_path} ({im.size})")
