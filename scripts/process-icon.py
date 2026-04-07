#!/usr/bin/env python3
"""FlySchedule — download icon.png from R2 and generate all favicon sizes.

Reads R2 credentials from .env, downloads `icon.png` from the
cavok-flight-photos bucket, and writes:

  src/app/icon.png         — Next.js auto-generated favicon (32x32)
  src/app/apple-icon.png   — iOS touch icon (180x180)
  public/icon-192.png      — PWA / generic 192
  public/icon-512.png      — PWA / large
  public/logo.png          — full-resolution copy for in-page <Image> use
  public/favicon.ico       — multi-resolution .ico (16, 32, 48)

The bucket stays private — this script just pulls one object and the
generated files are committed as static assets in the Next.js build.
No runtime R2 round-trip is needed for the favicon.

Run:
  /tmp/cavok-icon-venv/bin/python scripts/process-icon.py
"""

from __future__ import annotations

import os
import sys
from io import BytesIO
from pathlib import Path

# Resolve project root and load .env manually (no python-dotenv).
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / ".env"

env: dict[str, str] = {}
if ENV_PATH.exists():
    for raw in ENV_PATH.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")

R2_ENDPOINT = env.get("R2_ENDPOINT") or os.environ.get("R2_ENDPOINT")
R2_BUCKET = env.get("R2_BUCKET_NAME") or os.environ.get("R2_BUCKET_NAME")
R2_ACCESS_KEY_ID = env.get("R2_ACCESS_KEY_ID") or os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = env.get("R2_SECRET_ACCESS_KEY") or os.environ.get(
    "R2_SECRET_ACCESS_KEY"
)

if not (R2_ENDPOINT and R2_BUCKET and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY):
    sys.exit("Missing R2 credentials in .env")

import boto3  # noqa: E402
from botocore.client import Config  # noqa: E402
from PIL import Image  # noqa: E402

s3 = boto3.client(
    "s3",
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    config=Config(signature_version="s3v4"),
    region_name="auto",
)

print(f"Fetching icon.png from R2 bucket {R2_BUCKET}…")
buf = BytesIO()
s3.download_fileobj(R2_BUCKET, "icon.png", buf)
buf.seek(0)
src = Image.open(buf)
print(f"  source: {src.size}, mode={src.mode}")

# Normalize to RGBA so transparent backgrounds survive resizing
if src.mode != "RGBA":
    src = src.convert("RGBA")

# Output paths
APP_DIR = PROJECT_ROOT / "src" / "app"
PUB_DIR = PROJECT_ROOT / "public"

# Render targets — (size, output path, kind)
def write_png(size: int, path: Path) -> None:
    img = src.copy()
    # LANCZOS for high quality downsampling
    img.thumbnail((size, size), Image.Resampling.LANCZOS)
    # Pad to exact square size with transparent background
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset = ((size - img.width) // 2, (size - img.height) // 2)
    canvas.paste(img, offset, img)
    canvas.save(path, "PNG", optimize=True)
    print(f"  ✓ {path.relative_to(PROJECT_ROOT)} ({size}x{size})")


# Next.js App Router auto-generated icons
write_png(32, APP_DIR / "icon.png")
write_png(180, APP_DIR / "apple-icon.png")

# PWA / web manifest
write_png(192, PUB_DIR / "icon-192.png")
write_png(512, PUB_DIR / "icon-512.png")

# Full-resolution logo for in-page use via next/image
logo = src.copy()
logo.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
logo.save(PUB_DIR / "logo.png", "PNG", optimize=True)
print(f"  ✓ public/logo.png ({logo.size})")

# Multi-resolution favicon.ico (16, 32, 48). PIL embeds all sizes in
# one .ico container by passing the largest source image and the
# `sizes` arg — it does NOT use `append_images` (which is for GIF/WebP
# frames). Pre-resize to 256 so Pillow has plenty of pixels to downsample.
ico_path = PUB_DIR / "favicon.ico"
ico_source = src.copy()
ico_source.thumbnail((256, 256), Image.Resampling.LANCZOS)
ico_canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
offset = ((256 - ico_source.width) // 2, (256 - ico_source.height) // 2)
ico_canvas.paste(ico_source, offset, ico_source)
ico_canvas.save(
    ico_path,
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
)
print(f"  ✓ public/favicon.ico (16/32/48/64 multi-res)")

print("\nAll icons generated. Re-build the docker image to pick them up:")
print("  docker compose up -d --build")
