"""Procedural, tileable camouflage textures (numpy only, so it runs inside Blender or plain Python).
`multicam(n, palette)` returns an (n, n, 3) float32 sRGB image in 0..1: soft base gradient, large soft blobs,
medium shapes, dark twig strokes and light specks, all domain-warped so the shapes read organic, plus a fabric weave."""
import numpy as np

def _vnoise(x, y, cells, seed):
    """Periodic value noise sampled at float coords (x, y in 0..1 tile space), smoothstep-interpolated."""
    rng = np.random.default_rng(seed); g = rng.random((cells, cells)).astype(np.float32)
    fx, fy = (x % 1.0) * cells, (y % 1.0) * cells
    ix, iy = np.floor(fx).astype(np.int32), np.floor(fy).astype(np.int32); tx, ty = fx - ix, fy - iy
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    x0, x1, y0, y1 = ix % cells, (ix + 1) % cells, iy % cells, (iy + 1) % cells
    a, b, c, d = g[y0, x0], g[y0, x1], g[y1, x0], g[y1, x1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty

def _fbm(x, y, cells, seed, octaves=4):
    s, amp, tot = 0.0, 0.5, 0.0
    for o in range(octaves):
        s = s + _vnoise(x, y, cells << o, seed + o * 31) * amp; tot += amp; amp *= 0.5
    return s / tot

def _sm(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

MULTICAM = dict(base=(0.60, 0.54, 0.41), light=(0.67, 0.62, 0.50), green=(0.40, 0.40, 0.27), olive=(0.47, 0.41, 0.28),
                brown=(0.36, 0.27, 0.18), dark=(0.22, 0.17, 0.11), cream=(0.74, 0.70, 0.59))
ARID = dict(base=(0.54, 0.47, 0.35), light=(0.61, 0.55, 0.44), green=(0.41, 0.37, 0.25), olive=(0.46, 0.38, 0.25),
            brown=(0.36, 0.26, 0.17), dark=(0.22, 0.16, 0.10), cream=(0.68, 0.64, 0.55))
TROPIC = dict(base=(0.30, 0.33, 0.21), light=(0.38, 0.40, 0.26), green=(0.16, 0.22, 0.12), olive=(0.25, 0.27, 0.15),
              brown=(0.27, 0.21, 0.13), dark=(0.10, 0.10, 0.07), cream=(0.46, 0.46, 0.33))

def multicam(n=2048, pal=MULTICAM, seed=3, scale=1.0, weave=True):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32) / n
    # domain warp: shapes flow instead of looking like round noise blobs
    wx = x + 0.035 * (_fbm(x, y, int(6 * scale), seed + 1) - 0.5) * 2
    wy = y + 0.035 * (_fbm(x, y, int(6 * scale), seed + 2) - 0.5) * 2
    C = lambda k: np.array(pal[k], np.float32)
    img = np.broadcast_to(C('base'), (n, n, 3)).copy()
    grad = _sm(0.35, 0.75, _fbm(wx, wy, int(3 * scale), seed + 3))[..., None]
    img = img * (1 - grad * 0.6) + C('light') * grad * 0.6
    layers = [('green', 9, 0.57, 0.66, 4), ('olive', 13, 0.6, 0.65, 5), ('brown', 17, 0.63, 0.66, 6)]
    for col, cells, e0, e1, sd in layers:
        m = _sm(e0, e1, _fbm(wx * 1.0, wy * 1.15, int(cells * scale), seed + sd))[..., None]
        img = img * (1 - m) + C(col) * m
    # dark twigs: thin ridges of a stretched noise, only inside some regions
    r = 1 - np.abs(2 * _fbm(wx * 1.0, wy * 1.6, int(22 * scale), seed + 7, 3) - 1)
    region = _sm(0.45, 0.6, _fbm(wx, wy, int(7 * scale), seed + 8))
    twig = (_sm(0.9, 0.95, r) * region)[..., None]
    img = img * (1 - twig) + C('dark') * twig
    speck = _sm(0.72, 0.76, _fbm(wx, wy, int(40 * scale), seed + 9, 2))[..., None]
    img = img * (1 - speck * 0.55) + C('cream') * speck * 0.55
    if weave:   # ripstop grid + thread noise
        rip = ((np.sin(x * n * np.pi / 6) ** 40 + np.sin(y * n * np.pi / 6) ** 40) * 0.05)[..., None]
        thread = (0.94 + 0.12 * _vnoise(x, y, n // 2, seed + 11))[..., None]
        img = img * thread * (1 - rip)
    return np.clip(img, 0, 1).astype(np.float32)

if __name__ == '__main__':
    import sys
    from PIL import Image
    out = sys.argv[1]
    tiles = [multicam(512, p, scale=0.5) for p in (MULTICAM, ARID, TROPIC)]
    Image.fromarray((np.concatenate(tiles, axis=1) * 255).astype(np.uint8)).save(out)
