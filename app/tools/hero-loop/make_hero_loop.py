#!/usr/bin/env python3
"""Render the home hero loop (public/media/hero-loop-N.mp4 + hero-loop.json) from the hero still.

What it makes: an 8-second, seamless, 24 fps H.264 loop in which the model stays perfectly still and the LIGHT moves:
the sun-ripples in the backdrop drift, a warm sheen sweeps across the skin, glints twinkle in the air, and the frame
takes one slow breath of zoom. The person is separated from the backdrop with GrabCut, so only the backdrop warps.

The page uses the video only while hero-loop.json's "source" equals the hero image currently set in the admin. If you
change the hero image, run this again (or leave it: the page falls back to the still + live light layers by itself).

Needs:  pip install opencv-python numpy pillow imageio-ffmpeg
Usage:  python make_hero_loop.py <hero image path or URL> --version 2 [--subject right|left] [--crf 21]
        (run from anywhere; outputs go to ../../public/media/)
Assumptions: the photo is wide (16:9 works best) and the person fills one side (default: right) over a plain backdrop.
"""
import argparse, json, math, os, subprocess, sys, urllib.request
import cv2, numpy as np, imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.normpath(os.path.join(HERE, '..', '..', 'public', 'media'))
FPS, SECS = 24, 8

def load(src):
    path = src
    if src.startswith('http'):
        path = os.path.join(HERE, '_hero.src'); urllib.request.urlretrieve(src, path)
    from PIL import Image
    Image.open(path).convert('RGB').save(os.path.join(HERE, '_hero.png'))
    return cv2.imread(os.path.join(HERE, '_hero.png'))

def person_mask(img):
    H, W = img.shape[:2]
    m = np.full((H, W), cv2.GC_PR_BGD, np.uint8)
    m[:, :int(W * .50)] = cv2.GC_BGD
    m[:, int(W * .62):] = cv2.GC_PR_FGD
    m[int(H * .12):int(H * .62), int(W * .70):int(W * .92)] = cv2.GC_FGD
    m[int(H * .78):, int(W * .78):] = cv2.GC_FGD
    small = cv2.resize(img, (W // 2, H // 2)); m2 = cv2.resize(m, (W // 2, H // 2), interpolation=cv2.INTER_NEAREST)
    cv2.grabCut(small, m2, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    fg = np.where((m2 == cv2.GC_FGD) | (m2 == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    fg = cv2.resize(fg, (W, H), interpolation=cv2.INTER_LINEAR)
    n, lab, stats, _ = cv2.connectedComponentsWithStats((fg > 127).astype(np.uint8))
    fg = np.where(lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]), 255, 0).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    fg = cv2.dilate(fg, np.ones((9, 9), np.uint8))
    return cv2.GaussianBlur(fg, (0, 0), 14).astype(np.float32) / 255.0

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image'); ap.add_argument('--version', type=int, default=1)
    ap.add_argument('--subject', choices=['right', 'left'], default='right'); ap.add_argument('--crf', default='21')
    ap.add_argument('--source-url', default=None, help='the exact hero image URL set in the admin (default: the image argument if it is a URL)')
    a = ap.parse_args()
    rng = np.random.RandomState(7)
    img8 = load(a.image)
    flip = a.subject == 'left'
    if flip: img8 = img8[:, ::-1].copy()
    img = img8.astype(np.float32) / 255.0
    H, W = img.shape[:2]
    if W % 2 or H % 2: sys.exit('image width/height must be even')
    fg = person_mask(img8); bg = 1.0 - fg
    N = FPS * SECS
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); xn, yn = xx / W, yy / H
    lum = img[..., 2] * .299 + img[..., 1] * .587 + img[..., 0] * .114

    waves = []
    for _ in range(6):
        ang = rng.uniform(0, 2 * math.pi); k = rng.uniform(1.2, 3.6)
        waves.append(dict(kx=k * math.cos(ang), ky=k * math.sin(ang), m=int(rng.choice([1, 1, 2])) * rng.choice([-1, 1]), ph=rng.uniform(0, 2 * math.pi), ax=rng.uniform(.6, 1.4), ay=rng.uniform(.6, 1.4)))
    def displacement(t):
        dx = np.zeros((H, W), np.float32); dy = np.zeros((H, W), np.float32)
        for w in waves:
            dx += w['ax'] * np.sin(2 * math.pi * (w['kx'] * xn + w['ky'] * yn - w['m'] * t) + w['ph'])
            dy += w['ay'] * np.cos(2 * math.pi * (w['ky'] * xn - w['kx'] * yn - w['m'] * t) + w['ph'] * 1.3)
        return dx * (5.0 / 3.0), dy * (5.0 / 3.0)

    hw, hh = W // 3, H // 3
    gx, gy = np.meshgrid(np.linspace(0, 1, hw, dtype=np.float32), np.linspace(0, 1, hh, dtype=np.float32))
    cw = [dict(kx=rng.uniform(2, 6), ky=rng.uniform(2, 6), m=int(rng.choice([1, 2])) * rng.choice([-1, 1]), ph=rng.uniform(0, 6.28)) for _ in range(5)]
    def caustic(t):
        c = sum(np.sin(2 * math.pi * (w['kx'] * gx + w['ky'] * gy - w['m'] * t) + w['ph']) for w in cw) / len(cw) * .5 + .5
        c = cv2.GaussianBlur(np.clip((c - .52) * 3.0, 0, 1) ** 1.6, (0, 0), 5)
        return cv2.resize(c, (W, H), interpolation=cv2.INTER_CUBIC)

    def sprite(core, fl):
        n = 2 * fl + 1; yy_, xx_ = np.mgrid[-fl:fl + 1, -fl:fl + 1].astype(np.float32)
        s = np.exp(-(xx_ ** 2 + yy_ ** 2) / (2 * core ** 2))
        s += .9 * np.exp(-(yy_ ** 2) / (2 * .7 ** 2)) * np.exp(-np.abs(xx_) / (fl * .34)) * (np.abs(xx_) < fl)
        s += .9 * np.exp(-(xx_ ** 2) / (2 * .7 ** 2)) * np.exp(-np.abs(yy_) / (fl * .34)) * (np.abs(yy_) < fl)
        return np.clip(s, 0, 1)
    glints = []
    for _ in range(30):
        onskin = rng.rand() < .55
        fl = int(rng.choice([10, 14, 20, 28]))
        glints.append(dict(x=(rng.uniform(.60, .97) if onskin else rng.uniform(.04, .60)) * W, y=rng.uniform(.04, .96) * H, spr=sprite(rng.uniform(1.1, 2.4), fl), fl=fl,
                           m=int(rng.choice([1, 1, 2, 3])), ph=rng.rand(), a=rng.uniform(.5, 1.), jx=rng.uniform(4, 12), jy=rng.uniform(4, 12), jp=rng.rand()))
    sm = lambda e0, e1, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - e0) / (e1 - e0), 0, 1))
    warm, sheen_c, glint_c = np.array([.62, .86, 1.], np.float32), np.array([.55, .80, 1.], np.float32), np.array([.80, .93, 1.], np.float32)

    def frame(i):
        t = i / N
        dx, dy = displacement(t)
        warped = cv2.remap(img, xx + dx, yy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        out = img * fg[..., None] + warped * bg[..., None]
        out = 1 - (1 - out) * (1 - (caustic(t) * bg * .20)[..., None] * warm)
        band = np.exp(-(((xn * .80 + yn * .62) - (-.35 + 1.95 * t)) / .11) ** 2)
        sheen = band * fg * (.35 + .65 * sm(.42, .85, lum) ** 1.3) * .34
        out = 1 - (1 - out) * (1 - sheen[..., None] * sheen_c)
        layer = np.zeros((H, W), np.float32)
        for g in glints:
            al = (math.sin(math.pi * ((t * g['m'] + g['ph']) % 1.0)) ** 6) * g['a']
            if al < .02: continue
            cx = int(g['x'] + g['jx'] * math.sin(2 * math.pi * (t + g['jp']))); cy = int(g['y'] + g['jy'] * math.cos(2 * math.pi * (t + g['jp']))); f = g['fl']
            if cy - f < 0 or cx - f < 0 or cy + f + 1 > H or cx + f + 1 > W: continue
            layer[cy - f:cy + f + 1, cx - f:cx + f + 1] += g['spr'] * al
        out = 1 - (1 - out) * (1 - np.clip(layer, 0, 1)[..., None] * glint_c * .85)
        M = cv2.getRotationMatrix2D((W * .72, H * .38), 0, 1.0 + .022 * (.5 - .5 * math.cos(2 * math.pi * t)))
        out = cv2.warpAffine(out, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        out = np.clip(out * 255 + .5, 0, 255).astype(np.uint8)
        return out[:, ::-1].copy() if flip else out

    os.makedirs(MEDIA, exist_ok=True)
    name = f'hero-loop-{a.version}.mp4'; out_path = os.path.join(MEDIA, name)
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'slow',
           '-crf', str(a.crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out_path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    for i in range(N):
        p.stdin.write(frame(i).tobytes())
        if i % 24 == 0: print('frame', i, '/', N, flush=True)
    p.stdin.close(); p.wait()
    source = a.source_url or (a.image if a.image.startswith('http') else '')
    json.dump({'source': source, 'file': '/media/' + name, 'width': W, 'height': H, 'seconds': SECS}, open(os.path.join(MEDIA, 'hero-loop.json'), 'w'), indent=2)
    print('wrote', out_path, round(os.path.getsize(out_path) / 1024), 'KB;', 'source =', source or '(set "source" in hero-loop.json to the admin hero URL)')

if __name__ == '__main__':
    main()
