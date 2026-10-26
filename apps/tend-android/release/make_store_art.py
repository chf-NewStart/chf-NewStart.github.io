"""Play Store art for Tend: the 512 px icon and the 1024x500 feature graphic, in the room's pixel style.
Run from the repository root: python3 apps/tend-android/release/make_store_art.py (needs Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[3]
out = Path(__file__).resolve().parent / 'store'
out.mkdir(exist_ok=True)

Image.open(root / 'focus/icon-1024.png').convert('RGB').resize((512, 512), Image.NEAREST).save(out / 'icon-512.png')

PAPER, INK, MUTED, GREEN, TOMATO, RING_OFF = '#040706', '#f4efdc', '#8f9a92', '#76f7a5', '#ff5a43', '#17211c'
TOMATO_ART = ['.......GG.......', '....GG.GG.GG....', '.....GGGGGG.....', '...kkGGggGGkk...', '..krrrGggGrrrk..',
              '.krhhrrGGrrrrrk.', '.krhrrrrrrrrrrk.', 'krhrrrrrrrrrrrsk', 'krrrrrrrrrrrrrsk', 'krrrrrrrrrrrrssk',
              '.krrrrrrrrrrssk.', '.krsrrrrrrrsssk.', '..kssssssssssk..', '...kkkkkkkkkk...']
COLORS = {'k': '#2b0e09', 'h': '#ffd3c7', 'G': '#2f9e57', 'g': '#76f7a5', 'r': TOMATO, 's': '#b8321f'}

img = Image.new('RGB', (1024, 500), PAPER)
d = ImageDraw.Draw(img)
for x in range(0, 1024, 8):  # the faint room grid
    d.line([(x, 0), (x, 500)], fill='#08100c')
for y in range(0, 500, 8):
    d.line([(0, y), (1024, y)], fill='#08100c')

# The ring of blocks, two-thirds full, around the tomato, as in the dial.
cx, cy, cell = 790, 250, 11
points, seen, x, y, err = [], set(), 17, 0, 1 - 17
while x >= y:
    for p in [(x, y), (y, x), (-y, x), (-x, y), (-x, -y), (-y, -x), (y, -x), (x, -y)]:
        if p not in seen: seen.add(p); points.append(p)
    y += 1
    if err < 0: err += 2 * y + 1
    else: x -= 1; err += 2 * (y - x) + 1
import math
points.sort(key=lambda p: (math.atan2(p[0], -p[1]) + 2 * math.pi) % (2 * math.pi))
on = int(len(points) * 0.62)
for i, (dx, dy) in enumerate(points):
    color = TOMATO if i >= len(points) - on else RING_OFF
    d.rectangle([cx + dx * cell - 4, cy + dy * cell - 4, cx + dx * cell + 4, cy + dy * cell + 4], fill=color)
px = 9
for ty, row in enumerate(TOMATO_ART):
    for tx, ch in enumerate(row):
        if ch != '.':
            d.rectangle([cx - 8 * px + tx * px, cy - 7 * px + ty * px - 18, cx - 8 * px + (tx + 1) * px - 1, cy - 7 * px + (ty + 1) * px - 19], fill=COLORS[ch])

pixel = lambda size: ImageFont.truetype(str(root / 'apps/tend-android/app/src/main/res/font/plank_pixel.ttf'), size)
mono = ImageFont.truetype(str(root / 'apps/tend-android/app/src/main/res/font/plex_mono_medium.ttf'), 18)
d.text((70, 92), 'PIXEL TOMATO TIMER', font=mono, fill=GREEN)
d.text((66, 130), 'TEND', font=pixel(120), fill=INK)
d.text((70, 280), 'ONE QUESTION.', font=pixel(40), fill=INK)
d.text((70, 330), 'GO DEEPER.', font=pixel(40), fill=TOMATO)
d.text((70, 410), 'focus  /  note  /  return', font=mono, fill=MUTED)
lines = Image.new('RGBA', img.size, (0, 0, 0, 0))  # scanlines: one dark row in three, at 13% black
ImageDraw.Draw(lines).rectangle([0, 0, 1024, 500], fill=None)
for yy in range(0, 500, 3):
    ImageDraw.Draw(lines).line([(0, yy), (1024, yy)], fill=(0, 0, 0, 33))
img = Image.alpha_composite(img.convert('RGBA'), lines).convert('RGB')
img.save(out / 'feature-graphic-1024x500.png')
print('wrote', *sorted(p.name for p in out.iterdir()))
