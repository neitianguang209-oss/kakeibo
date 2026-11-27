# 家計簿のアイコンを作る(元絵: icons/icon-source.png = 本人が用意した、かえると貯金箱の絵)
# 使い方: C:\ProgramData\anaconda3\python.exe -I icons\make_icons.py
# 元絵の白い地と黒いふちを取りのぞき、読書記録アイコンと同じ生成り色の四角い地に置き直す。
from pathlib import Path
import numpy as np
from PIL import Image, ImageChops, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
BG = (246, 241, 229)  # 生成り色

src = Image.open(ROOT / 'icon-source.png').convert('RGB')
a = np.asarray(src).astype(int)
sat = a.max(axis=2) - a.min(axis=2)

# 色みのない部分(白い地・黒いふち・その境目)のうち、画像の端とつながっているところが「背景」
gray = sat < 28
lab, _ = ndimage.label(gray)
edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
outside = np.isin(lab, edge[edge > 0])
fg = ndimage.binary_opening(~outside, iterations=1)
# 小さなごみ(ふちの色にじみ)を捨てる。絵のまとまりだけ残す
lab, n = ndimage.label(fg)
size = ndimage.sum(fg, lab, range(1, n + 1))
h, w = fg.shape
keep = []
for i, s in enumerate(size, start=1):
    ys, xs = np.where(lab == i)
    touches = ys.min() < 16 or xs.min() < 16 or ys.max() > h - 8 or xs.max() > w - 8
    if s > 300 and not (touches and s < 3000):
        keep.append(i)
fg = ndimage.binary_fill_holes(np.isin(lab, keep))
# 腕・服・貯金箱に囲まれた大きな白い部分も背景(目の白や服の点線は小さいので残る)
lab, n = ndimage.label(a.min(axis=2) > 235)
for i in range(1, n + 1):
    region = lab == i
    if region.sum() > 1800 and fg[region].all():
        fg &= ~region

# ふちは、白との混ざりを地の色に掛け合わせてなじませる
wide = ndimage.binary_dilation(fg, iterations=2) & ~(a.max(axis=2) < 90) | fg
core = ndimage.binary_erosion(fg, iterations=1)
tinted = np.asarray(ImageChops.multiply(src, Image.new('RGB', src.size, BG)))
out = np.empty_like(np.asarray(src))
out[:] = BG
out[wide] = tinted[wide]
out[core] = np.asarray(src)[core]
art = Image.fromarray(out)

ys, xs = np.where(wide)
art = art.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def render(size, scale):
    """scale = 絵の横幅が、アイコンの横幅にしめる割合"""
    big = 1024
    aw = int(big * scale)
    ah = int(art.height * aw / art.width)
    pic = art.resize((aw, ah), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=45, threshold=2))
    canvas = Image.new('RGB', (big, big), BG)
    canvas.paste(pic, ((big - aw) // 2, (big - ah) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


# 四角のまま書き出す(角はスマホ側が丸める)
render(180, 0.80).save(ROOT / 'icon-180.png')
render(192, 0.80).save(ROOT / 'icon-192.png')
render(512, 0.80).save(ROOT / 'icon-512.png')
render(512, 0.66).save(ROOT / 'icon-maskable-512.png')  # 丸く切り抜く端末向けに、少し小さく
render(32, 0.92).save(ROOT / 'favicon-32.png')
print('ok')
