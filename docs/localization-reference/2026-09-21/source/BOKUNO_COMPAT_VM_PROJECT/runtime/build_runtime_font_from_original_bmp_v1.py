#!/usr/bin/env python3
"""Build the AI-SNES runtime font directly from the supplied source BMP.

This is intentionally independent of all Tactics Ogre GBC/font outputs and
of RS3's han.tbl.  It reads only the original 8x16 bitmap atlas and the atlas
cell correction map, then emits a simple Unicode-KS2350 indexed 2bpp stream
for the runtime injector.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tactics_ogre_project" / "05_extract" / "font_bitmap_fixed_ks2350_v2_shadow"
BMP = SOURCE / "font_bitmap_fixed_ks2350.bmp"
CELL_MAP = SOURCE / "font_bitmap_fixed_ks2350_cell_map.tsv"
OUT = Path(__file__).resolve().parent / "assets"
FONT_OUT = OUT / "runtime_font_from_original_bmp_ascii_ks2350_v2.planar2bpp"
REPORT_OUT = OUT / "runtime_font_from_original_bmp_ascii_ks2350_v2_report.json"

CELL_WIDTH = 10
CELL_HEIGHT = 18
GLYPH_X = 2
GLYPH_Y = 2
GLYPH_BYTES = 32
HANGUL_START_CELL = 95
ASCII = [chr(code) for code in range(0x20, 0x7F)]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ks2350() -> list[str]:
    """Return the BMP's direct logical order: 가부터 2,350 완성형."""
    out: list[str] = []
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try:
                ch = bytes((hi, lo)).decode("euc_kr")
            except UnicodeDecodeError:
                continue
            if len(ch) == 1 and "가" <= ch <= "힣":
                out.append(ch)
    if len(out) != 2350 or out[0] != "가":
        raise SystemExit(f"expected 가부터 2350 complete glyphs, got {len(out)}")
    return out


def planar_tile(rows: list[list[int]]) -> bytes:
    out = bytearray()
    for row in rows:
        low = high = 0
        for x, value in enumerate(row):
            low |= (value & 1) << (7 - x)
            high |= ((value >> 1) & 1) << (7 - x)
        out.extend((low, high))
    return bytes(out)


def extract(im: Image.Image, cell: int) -> bytes:
    x0 = (cell % 32) * CELL_WIDTH + GLYPH_X
    y0 = (cell // 32) * CELL_HEIGHT + GLYPH_Y
    rows: list[list[int]] = []
    for y in range(16):
        row: list[int] = []
        for x in range(8):
            # Native BG3 dialogue glyphs do not use transparent whitespace.
            # Their empty pixels carry the bubble's observed 2/0 checkerboard
            # fill (row 0 = 20202020, row 1 = 02020202).  Keep that fill under
            # every BMP glyph so changing text cannot punch a hole through the
            # dialogue surface.  Black BMP ink becomes native text colour 3.
            row.append(3 if im.getpixel((x0 + x, y0 + y)) == (0, 0, 0) else (2 if (x + y) % 2 == 0 else 0))
        rows.append(row)
    return planar_tile(rows[:8]) + planar_tile(rows[8:])


def main() -> None:
    if not BMP.exists() or not CELL_MAP.exists():
        raise SystemExit("original bitmap or cell map is missing")
    im = Image.open(BMP).convert("RGB")
    if im.size != (322, 1406):
        raise SystemExit(f"unexpected source bitmap size {im.size}; expected (322, 1406)")
    # The input is already the compacted, corrected BMP: cells 0..94 are
    # ASCII, cell 95 is 가, and the following 2,349 cells are its fixed KS
    # complete-Hangul sequence.  The separate cell map describes how this BMP
    # was made from the old 2,501-cell image; applying it here would shift the
    # finished sequence a second time.
    glyphs = ASCII + ks2350()
    output = bytearray()
    samples: dict[str, dict[str, int]] = {}
    for index, ch in enumerate(glyphs):
        fixed_cell = index
        output.extend(extract(im, fixed_cell))
        if ch in {"여", "기", "는", "이", "상", "없", "어"}:
            samples[ch] = {"index": index, "fixed_cell": fixed_cell}
    if len(output) != len(glyphs) * GLYPH_BYTES:
        raise SystemExit("incorrect derived runtime font length")
    OUT.mkdir(parents=True, exist_ok=True)
    FONT_OUT.write_bytes(output)
    report = {
        "format": "runtime-font-direct-original-bmp-ascii-ks2350-v2",
        "source_bmp": str(BMP),
        "source_bmp_sha256": sha256(BMP),
        "source_cell_map": str(CELL_MAP),
        "source_cell_map_role": "provenance only; not applied to an already fixed/compacted BMP",
        "source_bmp_pixels": "black ink -> native colour 3; BMP whitespace -> observed BG3 dialogue 2/0 checkerboard fill",
        "cell_geometry": {"grid": "32x78", "cell": "10x18", "glyph_origin": [2, 2], "glyph": "8x16"},
        "glyph_count": len(glyphs),
        "ascii_glyph_count": len(ASCII),
        "hangul_glyph_count": len(glyphs) - len(ASCII),
        "hangul_order": "KS X 1001 complete Hangul, 가부터 2350 glyphs",
        "derived_font": str(FONT_OUT),
        "derived_font_sha256": hashlib.sha256(output).hexdigest(),
        "chars": glyphs,
        "pilot_samples": samples,
    }
    REPORT_OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "font": str(FONT_OUT),
        "report": str(REPORT_OUT),
        "glyph_count": len(glyphs),
        "hangul_order": report["hangul_order"],
        "font_sha256": report["derived_font_sha256"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
