# Hero loop

`make_hero_loop.py` renders the home page's hero video from the hero still: a seamless 8-second loop where the model
stays still and the light moves (ripples in the backdrop, a warm sheen over the skin, twinkling glints, one slow breath
of zoom). Output: `public/media/hero-loop-N.mp4` (~1.2 MB) and `public/media/hero-loop.json`.

```
pip install opencv-python numpy pillow imageio-ffmpeg
python tools/hero-loop/make_hero_loop.py "<hero image URL or file>" --version 2
```

How the page uses it (`routes/shop.js`, `views/home.ejs`, `public/js/motion-home.js`):

- The video is shown **only while** `hero-loop.json`'s `source` equals the hero image currently set in the admin. If an
  admin changes the hero image, the page silently falls back to the still plus the live light layers. Re-run the script
  (with the new image and a bumped `--version`) to get a matching loop again.
- It starts after the hero's entrance, fades in over the still, and plays only while the hero is on screen.
- It plays on phones too: the video is the whole hero frame, so it lines up with the still under the same `object-fit:
  cover` crop on any screen shape. It is **not loaded** with "reduce motion", with data-saver or a slow connection, or in
  the low-power mode (`html.au-lite`), and it quietly stays the still if the OS refuses autoplay (e.g. iOS Low Power
  Mode). Those visitors get the still image and the live layers.

The script assumes a wide photo with the person on one side (use `--subject left` if they are on the left) in front of
a fairly plain backdrop. Always look at the result: the person must stay crisp and the backdrop movement subtle.
