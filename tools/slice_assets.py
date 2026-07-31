#!/usr/bin/env python3
"""Slice generated CosmOS art sheets into runtime assets.

Sources live in assets/src/ (raw model output). Everything under assets/icons/,
assets/core/ and assets/vfx/ is derived and safe to regenerate:

    python3 tools/slice_assets.py
"""

import os
import math

from PIL import Image, ImageDraw, ImageFilter, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "src")
MAGIC = (255, 0, 255)

# Icon sheet reading order must match the generation prompt.
ICON_NAMES = [
    "engine", "mandates", "dimensions", "notepad",
    "taskmgr", "recyclebin", "globe", "calls",
    "shop", "settings", "prestige", "achievements",
]
CORE_NAMES = ["idle", "charging", "overclocked", "void"]
VFX_NAMES = ["sigil", "halo", "flare", "motes"]


def outdir(*parts):
    path = os.path.join(ROOT, "assets", *parts)
    os.makedirs(path, exist_ok=True)
    return path


def key_out_background(cell):
    """Drop the sheet background by flood-filling inward from the corners.

    Flooding (rather than a colour threshold) keeps light pixels that belong to
    the artwork -- the bone-white star cores and the parchment page would all be
    erased by a plain near-white key.
    """
    w, h = cell.size
    probe = cell.copy()
    for corner in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        ImageDraw.floodfill(probe, corner, MAGIC, thresh=60)

    rgba = cell.convert("RGBA")
    src, dst = probe.load(), rgba.load()
    for y in range(h):
        for x in range(w):
            if src[x, y] == MAGIC:
                dst[x, y] = (0, 0, 0, 0)
    return rgba


def square_pad(img):
    box = img.getbbox()
    if not box:
        return img
    img = img.crop(box)
    side = max(img.size)
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return out


def circular_mask(size, feather=6, inset=2):
    """Alpha mask used to lift the round core device off its panel."""
    hi = size * 4
    mask = Image.new("L", (hi, hi), 0)
    ImageDraw.Draw(mask).ellipse((inset * 4, inset * 4, hi - inset * 4, hi - inset * 4), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    return mask.filter(ImageFilter.GaussianBlur(feather))


def slice_icons():
    sheet = Image.open(os.path.join(SRC, "icon-sheet-raw.png")).convert("RGB")
    cell = sheet.width // 4
    dest = outdir("icons")

    for index, name in enumerate(ICON_NAMES):
        col, row = index % 4, index // 4
        crop = sheet.crop((col * cell, row * cell, (col + 1) * cell, (row + 1) * cell))
        icon = square_pad(key_out_background(crop))
        icon.resize((96, 96), Image.LANCZOS).save(os.path.join(dest, f"{name}_96.png"))
        print(f"  icons/{name}_96.png  (from {icon.size[0]}px)")


def slice_cores():
    sheet = Image.open(os.path.join(SRC, "core-states-raw.png")).convert("RGB")
    cell = sheet.width // 2
    dest = outdir("core")
    mask = circular_mask(cell)

    for index, name in enumerate(CORE_NAMES):
        col, row = index % 2, index // 2
        crop = sheet.crop((col * cell, row * cell, (col + 1) * cell, (row + 1) * cell))
        # Same white gutter as the VFX sheet; left in, it survives the circular
        # mask at the cardinal points and rings the machine in white.
        panel = crop.crop(dark_panel_bbox(crop))
        # Square up before masking so the circle stays a circle.
        crop = panel.resize((cell, cell), Image.LANCZOS).convert("RGBA")
        crop.putalpha(mask)
        crop.resize((256, 256), Image.LANCZOS).save(os.path.join(dest, f"core_{name}_256.png"))
        print(f"  core/core_{name}_256.png  (panel {panel.size[0]}x{panel.size[1]})")


def dark_panel_bbox(cell, threshold=110):
    """Find the black panel inside a cell, ignoring the sheet's white margin.

    The model lays each grid out with white gutters. Those margins are fatal
    for additive plates: white adds at full strength, so an uncropped cell
    draws a bright square frame around every effect.
    """
    w, h = cell.size
    px = cell.convert("L").load()
    step = max(1, w // 256)

    left, right, top, bottom = w, -1, h, -1
    for y in range(0, h, step):
        for x in range(0, w, step):
            if px[x, y] < threshold:
                left, right = min(left, x), max(right, x)
                top, bottom = min(top, y), max(bottom, y)

    if right < 0:
        return (0, 0, w, h)
    # Pull in one step so no anti-aliased white edge survives the crop.
    pad = step * 2
    return (min(left + pad, w), min(top + pad, h),
            max(right - pad, 0) + 1, max(bottom - pad, 0) + 1)


def crush_black(plate, floor=34):
    """Force the field to true black so additive compositing adds nothing."""
    lut = []
    for i in range(256):
        lut.append(0 if i <= floor else min(255, round((i - floor) * 255 / (255 - floor))))
    return plate.point(lut * len(plate.getbands()))


def slice_vfx():
    """VFX plates keep their black field -- they are composited additively."""
    sheet = Image.open(os.path.join(SRC, "vfx-raw.png")).convert("RGB")
    cell = sheet.width // 2
    dest = outdir("vfx")

    for index, name in enumerate(VFX_NAMES):
        col, row = index % 2, index // 2
        crop = sheet.crop((col * cell, row * cell, (col + 1) * cell, (row + 1) * cell))
        crop = crop.crop(dark_panel_bbox(crop))
        crop = crush_black(crop)
        crop.resize((256, 256), Image.LANCZOS).save(os.path.join(dest, f"{name}_256.png"))
        print(f"  vfx/{name}_256.png  (panel {crop.size[0]}x{crop.size[1]})")


BACKGROUNDS = {
    "primordial": "cosmos-desktop-background__primordial-grid__probe.png",
    "void": "cosmos-desktop-background__void-breach__probe.png",
    "restored": "cosmos-desktop-background__restored-cosmos__probe.png",
}


TARGET_MEAN = 38.0  # ~15% luminance: dark enough to stay backdrop, light enough to read


def lift_exposure(plate, target=TARGET_MEAN):
    """Gamma-lift a plate to a usable wallpaper level.

    The raw art sits around 6% mean luminance -- gorgeous in isolation, but as a
    desktop it reads as pure black and swallows the icons sitting on it. Solving
    for gamma per plate keeps each one's own contrast curve intact instead of
    flattening them all with a fixed brightness offset.
    """
    mean = ImageStat.Stat(plate.convert("L")).mean[0]
    if mean <= 1:
        return plate, mean, 1.0

    gamma = math.log(target / 255.0) / math.log(mean / 255.0)
    gamma = max(0.45, min(1.0, gamma))  # only ever brighten, never crush
    lut = [min(255, round(255 * ((i / 255.0) ** gamma))) for i in range(256)]
    return plate.point(lut * len(plate.getbands())), mean, gamma


def prepare_backgrounds():
    """Desktop plates ship as WebP -- the PNG masters are ~2MB each."""
    probes = os.path.join(ROOT, "assets", "visual-probes")
    dest = outdir("backgrounds")

    for name, filename in BACKGROUNDS.items():
        source = os.path.join(probes, filename)
        if not os.path.exists(source):
            print(f"  ! missing probe for {name}: {filename}")
            continue
        plate = Image.open(source).convert("RGB").resize((1920, 1080), Image.LANCZOS)
        plate, was, gamma = lift_exposure(plate)
        out = os.path.join(dest, f"desktop_{name}.webp")
        plate.save(out, "WEBP", quality=86, method=6)
        now = ImageStat.Stat(plate.convert("L")).mean[0]
        print(f"  backgrounds/desktop_{name}.webp  "
              f"({os.path.getsize(out)// 1024}KB, mean {was:.0f}->{now:.0f}, gamma {gamma:.2f})")


if __name__ == "__main__":
    print("Slicing CosmOS art sheets:")
    slice_icons()
    slice_cores()
    slice_vfx()
    prepare_backgrounds()
    print("Done.")
