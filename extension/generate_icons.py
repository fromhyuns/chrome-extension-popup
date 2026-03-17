from PIL import Image, ImageDraw
import os

SIZES = [16, 48, 128]
OUT = os.path.join(os.path.dirname(__file__), 'icons')

TEAL = (15, 160, 155, 255)
WHITE = (255, 255, 255, 255)

def draw_icon(size):
    scale = size / 128
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded square background
    pad = int(4 * scale)
    r = int(24 * scale)
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, fill=TEAL)

    cx, cy = size // 2, size // 2
    arm = int(38 * scale)
    tick = int(18 * scale)
    lw = max(int(14 * scale), 3)

    # White bracket corners
    # Top-left
    d.line([(cx - arm, cy - arm), (cx - arm, cy - arm + tick)], fill=WHITE, width=lw)
    d.line([(cx - arm, cy - arm), (cx - arm + tick, cy - arm)], fill=WHITE, width=lw)
    # Top-right
    d.line([(cx + arm, cy - arm), (cx + arm, cy - arm + tick)], fill=WHITE, width=lw)
    d.line([(cx + arm, cy - arm), (cx + arm - tick, cy - arm)], fill=WHITE, width=lw)
    # Bottom-left
    d.line([(cx - arm, cy + arm), (cx - arm, cy + arm - tick)], fill=WHITE, width=lw)
    d.line([(cx - arm, cy + arm), (cx - arm + tick, cy + arm)], fill=WHITE, width=lw)
    # Bottom-right
    d.line([(cx + arm, cy + arm), (cx + arm, cy + arm - tick)], fill=WHITE, width=lw)
    d.line([(cx + arm, cy + arm), (cx + arm - tick, cy + arm)], fill=WHITE, width=lw)

    # Center dot
    dot_r = int(11 * scale)
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=WHITE)

    return img

for s in SIZES:
    img = draw_icon(s)
    img.save(os.path.join(OUT, f'icon{s}.png'))
    print(f'Generated icon{s}.png')
