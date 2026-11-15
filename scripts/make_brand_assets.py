"""Builds the share image and the app icons from the Hanos emblem.

Run from the repository root with any Python that has Pillow:
    python scripts/make_brand_assets.py

Outputs (committed, so a normal build needs no Python):
    public/og/hanos-og.png                                    1200 x 630 link preview (Open Graph and Twitter)
    src/app/icon.png, src/app/apple-icon.png                  browser and home-screen icons
    public/icons/icon-192.png, icon-512.png, maskable-512.png  web app manifest icons

The artwork reuses the landing page palette (paper, navy, ink). It is brand art, not mission imagery or data.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PAPER = (242, 241, 237)
NAVY = (14, 50, 79)
INK = (10, 10, 10)
EMBLEM = ROOT / "public" / "landing" / "hanos-logo.webp"
FONTS = Path("C:/Windows/Fonts")


def font(names, size):
    for n in names:
        for base in (FONTS, Path("/usr/share/fonts/truetype/dejavu"), Path("/Library/Fonts")):
            p = base / n
            if p.exists():
                return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def emblem(height):
    img = Image.open(EMBLEM).convert("RGBA")
    w = round(img.width * height / img.height)
    return img.resize((w, height), Image.LANCZOS)


def paste_center(canvas, img, cx, cy):
    canvas.alpha_composite(img, (round(cx - img.width / 2), round(cy - img.height / 2)))


def open_graph():
    W, H = 1200, 630
    im = Image.new("RGBA", (W, H), PAPER + (255,))
    d = ImageDraw.Draw(im)
    # organic navy shapes, echoing the landing page
    d.ellipse((-300, 470, 60, 760), fill=NAVY)
    d.ellipse((860, -190, 1360, 210), fill=NAVY)
    d.ellipse((930, 430, 1300, 720), fill=NAVY)
    d.ellipse((-90, -120, 190, 150), fill=NAVY)
    logo = emblem(150)
    im.alpha_composite(logo, (96, 150))
    big = font(["georgiab.ttf", "DejaVuSerif-Bold.ttf"], 132)
    mid = font(["georgia.ttf", "DejaVuSerif.ttf"], 44)
    small = font(["arialbd.ttf", "DejaVuSans-Bold.ttf"], 28)
    d.text((96 + logo.width + 40, 140), "HANOS", font=big, fill=INK)
    d.text((100, 340), "See the sky change.", font=mid, fill=INK)
    d.text((100, 402), "Real SPHEREx observations in time order,", font=small, fill=(46, 46, 42))
    d.text((100, 440), "motion and brightness checks, and sound.", font=small, fill=(46, 46, 42))
    d.text((100, 548), "hanos.surf  ·  NASA Space Apps Challenge 2026", font=small, fill=NAVY)
    out = im.convert("RGB")
    target = ROOT / "public" / "og" / "hanos-og.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    out.save(target, optimize=True)


def icon(size, pad_ratio, path, bg=PAPER):
    im = Image.new("RGBA", (size, size), bg + (255,))
    e = emblem(round(size * (1 - 2 * pad_ratio)))
    paste_center(im, e, size / 2, size / 2)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(path, optimize=True)


def main():
    open_graph()
    icon(512, 0.16, ROOT / "src" / "app" / "icon.png")
    icon(180, 0.16, ROOT / "src" / "app" / "apple-icon.png")
    icon(192, 0.16, ROOT / "public" / "icons" / "icon-192.png")
    icon(512, 0.16, ROOT / "public" / "icons" / "icon-512.png")
    icon(512, 0.28, ROOT / "public" / "icons" / "maskable-512.png")  # extra padding: safe zone for masked icons
    print("brand assets written")


if __name__ == "__main__":
    main()
