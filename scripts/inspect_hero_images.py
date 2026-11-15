import fitz
import os
import io
from PIL import Image

pdf_path = os.path.join("docs", "03-design", "Hanos Cards (Twitter Post) (1).pdf")
doc = fitz.open(pdf_path)
names = ["star", "planet", "dwarf", "galaxies", "boundaries"]

for i in range(len(doc)):
    page = doc[i]
    images = page.get_images()
    print(f"=== Page {i} ({names[i]}) ===")
    for img in images:
        xref = img[0]
        base_img = doc.extract_image(xref)
        w, h = base_img["width"], base_img["height"]
        print(f"  xref {xref}: {w}x{h} ({base_img['ext']})")
