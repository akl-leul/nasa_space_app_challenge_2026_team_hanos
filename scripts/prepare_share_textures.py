"""
prepare_share_textures.py - Preprocess share card background textures.
Extracts lower-left 16:9 crop from high-resolution source textures and saves
optimized WebP files into public/share/.
"""

import os
from PIL import Image

SOURCE_DIR = os.path.join("docs", "03-design", "assets", "share-card", "textures")
TARGET_DIR = os.path.join("public", "share")

# The PDF places the 1941x2912 source texture scaled and cropped such that the
# visible 1600x900 window shows source pixels x: [0, 1109] and y: [2250, 2874].
# Export target is 1920x1080 (1.2x scale of 1600x900).
CROP_BOX = (0, 2250, 1109, 2874) # (left, top, right, bottom)
EXPORT_SIZE = (1920, 1080)

TEXTURES = [
    ("star-gold.jpg", "tex-star-gold.webp"),
    ("star-slate.jpg", "tex-star-slate.webp"),
    ("region-graphite.jpg", "tex-region-graphite.webp"),
]

def main():
    os.makedirs(TARGET_DIR, exist_ok=True)
    for src_name, dst_name in TEXTURES:
        src_path = os.path.join(SOURCE_DIR, src_name)
        dst_path = os.path.join(TARGET_DIR, dst_name)
        if not os.path.exists(src_path):
            print(f"Warning: {src_path} not found")
            continue

        im = Image.open(src_path)
        cropped = im.crop(CROP_BOX).resize(EXPORT_SIZE, Image.Resampling.LANCZOS)
        cropped.save(dst_path, "WEBP", quality=88, method=6)
        file_size = os.path.getsize(dst_path)
        print(f"Generated {dst_path}: {file_size / 1024:.1f} KB")

if __name__ == "__main__":
    main()
