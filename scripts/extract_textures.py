import fitz
import os
import io
from PIL import Image

pdf_path = os.path.join("docs", "03-design", "Hanos Cards (Twitter Post) (1).pdf")
target_dir = os.path.join("public", "share")
os.makedirs(target_dir, exist_ok=True)

doc = fitz.open(pdf_path)
names = ["star-gold", "planet-olive", "dwarf-slate", "galaxy-violet", "region-graphite"]
CROP_BOX = (0, 2250, 1109, 2874)
EXPORT_SIZE = (1920, 1080)

for i in range(len(doc)):
    page = doc[i]
    images = page.get_images()
    for img in images:
        xref = img[0]
        base_img = doc.extract_image(xref)
        w, h = base_img["width"], base_img["height"]
        if w == 1941 and h == 2912:
            im = Image.open(io.BytesIO(base_img["image"]))
            cropped = im.crop(CROP_BOX).resize(EXPORT_SIZE, Image.Resampling.LANCZOS)
            out_file = f"tex-{names[i]}.webp"
            out_path = os.path.join(target_dir, out_file)
            cropped.save(out_path, "WEBP", quality=88, method=6)
            size_kb = os.path.getsize(out_path) / 1024
            print(f"Page {i} ({names[i]}): saved {out_path} ({size_kb:.1f} KB)")
            break
