from __future__ import annotations

import hashlib
import re
import struct
from io import BytesIO


def compute_sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _parse_png_size(payload: bytes) -> tuple[int, int] | None:
    if len(payload) < 24:
        return None
    if not payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return None
    width = struct.unpack(">I", payload[16:20])[0]
    height = struct.unpack(">I", payload[20:24])[0]
    return int(width), int(height)


def _parse_gif_size(payload: bytes) -> tuple[int, int] | None:
    if len(payload) < 10:
        return None
    if not (payload.startswith(b"GIF87a") or payload.startswith(b"GIF89a")):
        return None
    width, height = struct.unpack("<HH", payload[6:10])
    return int(width), int(height)


def _parse_jpeg_size(payload: bytes) -> tuple[int, int] | None:
    stream = BytesIO(payload)
    if stream.read(2) != b"\xFF\xD8":
        return None

    while True:
        marker_start = stream.read(1)
        if not marker_start:
            return None
        if marker_start != b"\xFF":
            continue
        marker = stream.read(1)
        if not marker:
            return None
        while marker == b"\xFF":
            marker = stream.read(1)
            if not marker:
                return None
        code = marker[0]
        if code in {0xD8, 0xD9}:
            continue
        length_bytes = stream.read(2)
        if len(length_bytes) != 2:
            return None
        length = struct.unpack(">H", length_bytes)[0]
        if length < 2:
            return None

        if code in {
            0xC0,
            0xC1,
            0xC2,
            0xC3,
            0xC5,
            0xC6,
            0xC7,
            0xC9,
            0xCA,
            0xCB,
            0xCD,
            0xCE,
            0xCF,
        }:
            data = stream.read(length - 2)
            if len(data) < 5:
                return None
            height = struct.unpack(">H", data[1:3])[0]
            width = struct.unpack(">H", data[3:5])[0]
            return int(width), int(height)
        stream.seek(length - 2, 1)


def _parse_svg_size(payload: bytes) -> tuple[int, int] | None:
    text = payload[:4096].decode("utf-8", errors="ignore")
    if "<svg" not in text.lower():
        return None
    width_match = re.search(r'width\s*=\s*"([0-9.]+)', text, flags=re.IGNORECASE)
    height_match = re.search(r'height\s*=\s*"([0-9.]+)', text, flags=re.IGNORECASE)
    if width_match and height_match:
        return int(float(width_match.group(1))), int(float(height_match.group(1)))
    viewbox = re.search(
        r'viewBox\s*=\s*"([0-9.\s\-]+)"',
        text,
        flags=re.IGNORECASE,
    )
    if viewbox:
        parts = [p for p in viewbox.group(1).replace(",", " ").split(" ") if p]
        if len(parts) == 4:
            try:
                width = int(float(parts[2]))
                height = int(float(parts[3]))
                return width, height
            except ValueError:
                return None
    return None


def detect_image_dimensions(payload: bytes, mime_type: str) -> tuple[int, int] | None:
    mime = (mime_type or "").lower()
    if mime == "image/png":
        return _parse_png_size(payload)
    if mime in {"image/jpeg", "image/jpg"}:
        return _parse_jpeg_size(payload)
    if mime == "image/gif":
        return _parse_gif_size(payload)
    if mime == "image/svg+xml":
        return _parse_svg_size(payload)

    return _parse_png_size(payload) or _parse_jpeg_size(payload) or _parse_gif_size(payload) or _parse_svg_size(payload)
