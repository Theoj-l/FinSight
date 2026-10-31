"""Render the app's background marble texture: web/public/marble.webp.

    ml-service/venv/bin/python web/scripts/generate-marble.py            # writes the WebP
    ml-service/venv/bin/python web/scripts/generate-marble.py --preview  # also a PNG next to it

A soft white stone with navy veining, procedurally generated so it can be
re-tuned (style, contrast, seed) without a stock image. The app uses the "onyx"
style (seed 7), chosen from the styles below; the others are kept so the choice
can be revisited. Needs numpy, scipy and Pillow, which the ml-service venv
already has.

How it works: smooth fractal noise (several octaves of upsampled random grids)
warps the coordinates ("domain warping"); a sine across the warped coordinates
gives long, folded bands, and the bands' zero-crossings become thin veins.
Everything is blended onto the app surface colour at low alpha so it stays subtle.
"""
from __future__ import annotations

import argparse
import os

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

OUT = os.path.join(os.path.dirname(__file__), os.pardir, "public", "marble.webp")
W, H = 2560, 1600
BASE = np.array([246, 248, 252]) / 255      # --color-app-surface
NAVY = np.array([31, 42, 121]) / 255        # --color-brand-navy
BLUE = np.array([76, 111, 187]) / 255       # --color-brand-blue


def fbm(rng: np.random.Generator, octaves: int, base_cells: int, persistence: float = 0.5) -> np.ndarray:
    """Fractal noise in roughly [-1, 1]: random grids upsampled smoothly, finer octaves weaker."""
    total = np.zeros((H, W))
    amplitude, norm = 1.0, 0.0
    for octave in range(octaves):
        cells = base_cells * 2 ** octave
        grid = rng.standard_normal((max(2, cells * H // W), cells)).astype(np.float32)
        layer = np.asarray(Image.fromarray(grid, mode="F").resize((W, H), Image.Resampling.BICUBIC))
        total += amplitude * layer
        norm += amplitude
        amplitude *= persistence
    total /= norm
    return total / (np.abs(total).max() + 1e-9)


def warp(field: np.ndarray, dx: np.ndarray, dy: np.ndarray, strength: float) -> np.ndarray:
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    return map_coordinates(field, [ys + dy * strength, xs + dx * strength], order=1, mode="reflect")


def veins(phase: np.ndarray, width: float) -> np.ndarray:
    """1 on the zero-crossings of sin(phase), falling off to 0 within `width`."""
    return np.exp(-(np.sin(phase) / width) ** 2)


def ridges(field: np.ndarray, width: float) -> np.ndarray:
    """1 where a noise field crosses zero: a branching network, like cracks in stone."""
    return np.exp(-(field / width) ** 2)


class Canvas:
    def __init__(self) -> None:
        self.image = np.broadcast_to(BASE, (H, W, 3)).copy()

    def blend(self, colour: np.ndarray, alpha: np.ndarray) -> None:
        self.image[:] = self.image * (1 - alpha[..., None]) + colour * alpha[..., None]


def silk(rng: np.random.Generator, u: np.ndarray, v: np.ndarray, c: Canvas) -> None:
    """Long, smooth diagonal veins that swell and fade, with fine secondary veining."""
    # Domain warping folds the bands like real stone. Low octaves keep the main
    # veins' large curves smooth; the fine hairlines get the jagged detail.
    wx, wy = fbm(rng, 3, 2), fbm(rng, 3, 2)
    turbulence = warp(fbm(rng, 4, 2, 0.45), wx, wy, 320)
    # The warp stays weaker than the diagonal gradient, so bands fold without
    # closing into loops.
    main_phase = (u * 1.5 - v * 0.95) * np.pi * 2 + turbulence * 3.2
    presence = np.clip(fbm(rng, 3, 2) * 1.8 + 0.35, 0, 1)        # where a vein shows at all
    thickness = 0.035 + 0.05 * np.clip(fbm(rng, 3, 3) * 0.5 + 0.5, 0, 1)
    main = veins(main_phase, thickness) * presence
    mid_phase = (u * 2.3 - v * 1.9) * np.pi * 2 + warp(fbm(rng, 5, 2, 0.45), wy, wx, 220) * 3.6
    mid = veins(mid_phase, 0.03) * np.clip(fbm(rng, 3, 2) * 1.8 + 0.2, 0, 1)
    fine_phase = (u * 3.4 - v * 1.6) * np.pi * 2 + warp(fbm(rng, 6, 3), wy, wx, 160) * 4.5
    fine = veins(fine_phase, 0.02) * np.clip(fbm(rng, 4, 3) * 2.2 - 0.2, 0, 1)
    clouds = np.clip(fbm(rng, 5, 2) * 0.5 + 0.5, 0, 1) ** 1.6
    c.blend(BLUE, clouds * 0.07)
    c.blend(BLUE, veins(main_phase, 0.45) * presence * 0.06)
    c.blend(BLUE, fine * 0.09)
    c.blend(BLUE, mid * 0.11)
    c.blend(NAVY, main * 0.24)


def calacatta(rng: np.random.Generator, u: np.ndarray, v: np.ndarray, c: Canvas) -> None:
    """A few bold, rough-edged veins across wide white space, with thin branches."""
    wx, wy = fbm(rng, 5, 2, 0.55), fbm(rng, 5, 2, 0.55)
    # More octaves in the warp than silk: the veins keep their large path but
    # get a rough, broken edge like real Calacatta.
    turbulence = warp(fbm(rng, 6, 2, 0.5), wx, wy, 240)
    phase = (u * 1.7 - v * 1.1) * np.pi * 2 + turbulence * 2.4
    presence = np.clip(fbm(rng, 3, 2) * 1.6 + 0.5, 0, 1)
    thickness = 0.03 + 0.08 * np.clip(fbm(rng, 4, 3) * 0.5 + 0.5, 0, 1) ** 2
    bold = veins(phase, thickness) * presence
    # Branches leave the bold veins at a shallow angle and fade quickly.
    branch_phase = (u * 2.6 - v * 0.7) * np.pi * 2 + warp(fbm(rng, 5, 3), wy, wx, 180) * 3.0
    branches = veins(branch_phase, 0.025) * veins(phase, 0.7) * presence
    clouds = np.clip(fbm(rng, 4, 2) * 0.5 + 0.5, 0, 1) ** 2
    c.blend(BLUE, clouds * 0.05)
    c.blend(BLUE, veins(phase, 0.35) * presence * 0.07)      # mineral halo
    c.blend(BLUE, branches * 0.16)
    c.blend(NAVY, bold * 0.30)


def carrara(rng: np.random.Generator, u: np.ndarray, v: np.ndarray, c: Canvas) -> None:
    """Dense, fine, soft veining all over in one direction, on a cloudy ground."""
    wx, wy = fbm(rng, 4, 2), fbm(rng, 4, 2)
    clouds = np.clip(fbm(rng, 5, 3) * 0.5 + 0.5, 0, 1) ** 1.3
    c.blend(BLUE, clouds * 0.09)
    # Three families of thin veins at slightly different angles and scales.
    for freq_u, freq_v, strength, width, alpha in ((3.2, -1.8, 2.6, 0.03, 0.10), (4.6, -2.9, 3.2, 0.022, 0.08), (2.1, -2.4, 2.2, 0.026, 0.07)):
        phase = (u * freq_u + v * freq_v) * np.pi * 2 + warp(fbm(rng, 5, 2, 0.5), wx, wy, 200) * strength
        presence = np.clip(fbm(rng, 3, 3) * 2.0 + 0.2, 0, 1)
        c.blend(NAVY if alpha >= 0.1 else BLUE, veins(phase, width) * presence * alpha)


def statuario(rng: np.random.Generator, u: np.ndarray, v: np.ndarray, c: Canvas) -> None:
    """Bold veins that cross and join into an open web, like Statuario."""
    wx, wy = fbm(rng, 3, 2), fbm(rng, 3, 2)
    # A smooth (few-octave) field keeps the web's cells large and open, with no
    # small islands; two vein directions crossing make the joins.
    first = (u * 1.4 - v * 1.0) * np.pi * 2 + warp(fbm(rng, 4, 2, 0.45), wx, wy, 300) * 2.8
    second = (u * 0.6 + v * 1.5) * np.pi * 2 + warp(fbm(rng, 4, 2, 0.45), wy, wx, 300) * 2.6
    weight = np.clip(fbm(rng, 3, 2) * 0.5 + 0.5, 0, 1)
    presence_a = np.clip(fbm(rng, 3, 2) * 1.8 + 0.4, 0, 1)
    presence_b = np.clip(fbm(rng, 3, 2) * 1.8 - 0.1, 0, 1)
    web = np.maximum(veins(first, 0.03 + 0.05 * weight ** 2) * presence_a, veins(second, 0.03) * presence_b * 0.8)
    clouds = np.clip(fbm(rng, 4, 2) * 0.5 + 0.5, 0, 1) ** 1.8
    c.blend(BLUE, clouds * 0.06)
    c.blend(BLUE, veins(first, 0.3) * presence_a * 0.05)
    c.blend(NAVY, web * 0.24)


def onyx(rng: np.random.Generator, u: np.ndarray, v: np.ndarray, c: Canvas) -> None:
    """Broad, flowing layered bands with fine edges: calm and architectural."""
    wx, wy = fbm(rng, 3, 2), fbm(rng, 3, 2)
    phase = (u * 1.2 + v * 0.5) * np.pi * 2 + warp(fbm(rng, 4, 2, 0.45), wx, wy, 300) * 2.4
    bands = (0.5 + 0.5 * np.sin(phase)) ** 3
    edges = veins(phase * 2, 0.05) * np.clip(fbm(rng, 3, 2) * 1.5 + 0.5, 0, 1)
    c.blend(BLUE, bands * 0.08)
    c.blend(NAVY, edges * 0.11)
    c.blend(BLUE, np.clip(fbm(rng, 5, 3) * 0.5 + 0.5, 0, 1) ** 2 * 0.05)


STYLES = {"silk": silk, "calacatta": calacatta, "carrara": carrara, "statuario": statuario, "onyx": onyx}


def render(seed: int, style: str = "silk") -> np.ndarray:
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    canvas = Canvas()
    STYLES[style](rng, xs / W, ys / H, canvas)
    return (np.clip(canvas.image, 0, 1) * 255).round().astype(np.uint8)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--style", choices=sorted(STYLES), default="onyx")
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--preview", action="store_true", help="also write a PNG beside the WebP")
    args = ap.parse_args()
    image = Image.fromarray(render(args.seed, args.style))
    out = os.path.abspath(args.out)
    image.save(out, "WEBP", quality=82, method=6)
    if args.preview:
        image.save(os.path.splitext(out)[0] + ".png")
    print(f"wrote {out} ({os.path.getsize(out) // 1024} KB)")


if __name__ == "__main__":
    main()
