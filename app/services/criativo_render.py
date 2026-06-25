"""Montagem do criativo final (sem IA) — composição com Pillow.

Recebe a base visual (gerada pelo gpt-image-2) e aplica template/layout simples:
scrim de legibilidade + camadas de texto (headline/subtítulo/CTA) + logo real.
Exporta no tamanho final do canal.

Decisão (MVP): render server-side com Pillow (síncrono, ~300ms, sem Chromium).
Reproduz o preview do front com fidelidade aproximada. Upgrade para Playwright
(WYSIWYG pixel-perfect) fica como evolução futura se necessário.
"""
from __future__ import annotations

import unicodedata
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

# Posição/tamanho da logo a partir do creative_spec (termos PT do modelo de visão)
_LOGO_SIZE_FRAC = {"pequena": 0.10, "media": 0.135, "grande": 0.19}
_LOGO_ANCHORS = {
    "topo-esquerda": ("left", "top"),
    "topo-centro": ("center", "top"),
    "topo-direita": ("right", "top"),
    "rodape-esquerda": ("left", "bottom"),
    "rodape-centro": ("center", "bottom"),
    "rodape-direita": ("right", "bottom"),
}


def _norm_termo(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower().strip()
    return s.replace(" ", "-").replace("_", "-")

_FONT_DIR = "/usr/share/fonts/truetype/dejavu"
_GOLD = (242, 101, 34)  # --ws-gold (#F26522)
_WHITE = (255, 255, 255)

# creative_format -> tamanho final do canal
EXPORT_SIZES: dict[str, tuple[int, int]] = {
    "feed_1x1": (1080, 1080),
    "quadrado": (1080, 1080),
    "feed_4x5": (1080, 1350),
    "retrato": (1080, 1350),
    "story": (1080, 1920),
    "reels": (1080, 1920),
    "9x16": (1080, 1920),
    "9:16": (1080, 1920),
    "4x3": (1440, 1080),
    "4:3": (1440, 1080),
    "paisagem": (1080, 566),
    "banner": (1080, 566),
}


def export_size(creative_format: str | None) -> tuple[int, int]:
    return EXPORT_SIZES.get((creative_format or "").strip().lower(), (1080, 1080))


def _font(bold: bool, size: int) -> ImageFont.FreeTypeFont:
    nome = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(f"{_FONT_DIR}/{nome}", size)


def _line_h(font: ImageFont.FreeTypeFont) -> int:
    asc, desc = font.getmetrics()
    return asc + desc


def _cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """object-cover: escala cobrindo o alvo e corta no centro."""
    tw, th = size
    sw, sh = img.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    img = img.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - tw) // 2, (nh - th) // 2
    return img.crop((left, top, left + tw, top + th))


def ajustar_para_canvas(
    content: bytes, creative_format: str | None, *, recortar: bool = True
) -> bytes:
    """Reenquadra a imagem gerada para o tamanho EXATO do canal (object-cover).

    O gpt-image-2 só devolve 1024²/1024×1536/1536×1024, então 4:5 e 9:16 vinham
    ambos em 2:3. Aqui escalamos/cortamos pro size final do canal (EXPORT_SIZES):
    1:1→1080×1080, 4:5→1080×1350, 9:16→1080×1920. Centro preservado; o respiro
    pedido no prompt evita que conteúdo essencial caia na faixa cortada.

    `recortar=False` (gerador original): preserva a arte INTEIRA no tamanho nativo
    do gpt-image, sem cortar bordas pro aspecto do canal. O carrossel usa o
    default True (precisa do aspecto exato do canal).
    """
    img = Image.open(BytesIO(content))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    if recortar:
        img = _cover(img, export_size(creative_format))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    linhas: list[str] = []
    atual = ""
    for palavra in text.split():
        teste = f"{atual} {palavra}".strip()
        if not atual or draw.textlength(teste, font=font) <= max_w:
            atual = teste
        else:
            linhas.append(atual)
            atual = palavra
    if atual:
        linhas.append(atual)
    return linhas


def _scrim(size: tuple[int, int], layout: str) -> Image.Image:
    """Gradiente preto p/ legibilidade do texto (igual ao preview do front)."""
    w, h = size
    mask = Image.new("L", (1, h), 0)
    px = mask.load()
    if layout == "centro":
        nivel = int(0.32 * 255)
        for y in range(h):
            px[0, y] = nivel
    else:  # inferior: transparente até ~40%, escurecendo até ~62% embaixo
        inicio = int(h * 0.40)
        for y in range(h):
            if y < inicio:
                px[0, y] = 0
            else:
                t = (y - inicio) / max(1, (h - inicio))
                px[0, y] = int(0.62 * 255 * t)
    mask = mask.resize((w, h))
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    layer.putalpha(mask)
    return layer


def montar_criativo(
    base_bytes: bytes,
    *,
    creative_format: str | None = None,
    layout: str = "inferior",
    headline: str = "",
    subtitulo: str = "",
    cta: str = "",
    logo_bytes: bytes | None = None,
) -> bytes:
    """Compõe o criativo final e devolve PNG bytes."""
    w, h = export_size(creative_format)
    base = Image.open(BytesIO(base_bytes)).convert("RGB")
    canvas = _cover(base, (w, h)).convert("RGBA")

    tem_texto = bool(headline or subtitulo or cta)
    if tem_texto:
        canvas = Image.alpha_composite(canvas, _scrim((w, h), layout))

    draw = ImageDraw.Draw(canvas)
    margin = int(w * 0.06)
    centro = layout == "centro"

    # Logo (canto superior esquerdo)
    if logo_bytes:
        try:
            logo = Image.open(BytesIO(logo_bytes)).convert("RGBA")
            lh = int(w * 0.13)
            lw = int(logo.width * lh / logo.height)
            max_lw = int(w * 0.40)
            if lw > max_lw:
                lw, lh = max_lw, int(logo.height * max_lw / logo.width)
            logo = logo.resize((max(1, lw), max(1, lh)), Image.LANCZOS)
            canvas.alpha_composite(logo, (int(w * 0.05), int(w * 0.05)))
        except Exception:
            pass

    f_head = _font(True, int(w * 0.075))
    f_sub = _font(False, int(w * 0.040))
    f_cta = _font(True, int(w * 0.040))
    max_w = w - 2 * margin

    head_lines = _wrap(draw, headline, f_head, max_w) if headline else []
    sub_lines = _wrap(draw, subtitulo, f_sub, max_w) if subtitulo else []

    head_h = sum(int(_line_h(f_head) * 1.05) for _ in head_lines)
    sub_h = (int(w * 0.02) + sum(int(_line_h(f_sub) * 1.1) for _ in sub_lines)) if sub_lines else 0
    cta_box_h = int(_line_h(f_cta) + 2 * int(w * 0.022))
    cta_h = (int(w * 0.035) + cta_box_h) if cta else 0
    block_h = head_h + sub_h + cta_h

    if centro:
        y = (h - block_h) // 2
    else:
        y = h - int(h * 0.07) - block_h

    def _draw_line(text: str, font: ImageFont.FreeTypeFont, yy: int, fill=_WHITE) -> None:
        if centro:
            xx = (w - draw.textlength(text, font=font)) / 2
        else:
            xx = margin
        draw.text((xx + 2, yy + 2), text, font=font, fill=(0, 0, 0, 150))
        draw.text((xx, yy), text, font=font, fill=fill)

    for ln in head_lines:
        _draw_line(ln, f_head, y)
        y += int(_line_h(f_head) * 1.05)

    if sub_lines:
        y += int(w * 0.02)
        for ln in sub_lines:
            _draw_line(ln, f_sub, y, fill=(255, 255, 255))
            y += int(_line_h(f_sub) * 1.1)

    if cta:
        y += int(w * 0.035)
        pad_x, pad_y = int(w * 0.05), int(w * 0.022)
        cta_w = int(draw.textlength(cta, font=f_cta) + 2 * pad_x)
        x0 = int((w - cta_w) / 2) if centro else margin
        draw.rounded_rectangle(
            [x0, y, x0 + cta_w, y + cta_box_h], radius=cta_box_h // 2, fill=_GOLD
        )
        draw.text((x0 + pad_x, y + pad_y), cta, font=f_cta, fill=_WHITE)

    out = BytesIO()
    canvas.convert("RGB").save(out, format="PNG")
    return out.getvalue()


def aplicar_logo(
    base_png: bytes,
    logo_bytes: bytes,
    *,
    creative_format: str | None = None,
    position: str = "topo-esquerda",
    size: str = "media",
    badge: bool = False,
) -> bytes:
    """Compõe a logo real sobre a arte na posição/tamanho indicados.

    No Modelo Reverso, `position`/`size` vêm de `regions.logo` do creative_spec e a
    logo é aplicada LIMPA na área que o modelo reservou (badge=False). O modo
    `badge=True` (legado force_real_logo) envolve num retângulo translúcido.
    """
    img = Image.open(BytesIO(base_png)).convert("RGBA")
    w, h = img.size
    logo = Image.open(BytesIO(logo_bytes)).convert("RGBA")

    frac = _LOGO_SIZE_FRAC.get(_norm_termo(size), 0.135)
    lh = int(w * frac)
    lw = int(logo.width * lh / logo.height)
    max_lw = int(w * 0.42)
    if lw > max_lw:
        lw, lh = max_lw, int(logo.height * max_lw / logo.width)
    logo = logo.resize((max(1, lw), max(1, lh)), Image.LANCZOS)

    if badge:
        pad = int(lh * 0.30)
        carimbo = Image.new("RGBA", (lw + 2 * pad, lh + 2 * pad), (255, 255, 255, 0))
        bd = ImageDraw.Draw(carimbo)
        bd.rounded_rectangle(
            [0, 0, carimbo.width - 1, carimbo.height - 1],
            radius=int(carimbo.height * 0.28),
            fill=(255, 255, 255, 210),
        )
        carimbo.alpha_composite(logo, (pad, pad))
        logo = carimbo

    cw, ch = logo.size
    pnorm = _norm_termo(position)
    hx, vy = _LOGO_ANCHORS.get(pnorm, ("", ""))
    if not hx:  # termo aproximado (ex.: "topo", "rodape-...", "meio-esquerda")
        vy = "bottom" if any(t in pnorm for t in ("rodape", "inferior", "bottom")) else "top"
        hx = (
            "right" if any(t in pnorm for t in ("direita", "right"))
            else "center" if any(t in pnorm for t in ("centro", "central", "center"))
            else "left"
        )

    margin = int(w * 0.05)
    x = margin if hx == "left" else (w - cw - margin if hx == "right" else (w - cw) // 2)
    y = margin if vy == "top" else (h - ch - margin)
    img.alpha_composite(logo, (x, y))

    out = BytesIO()
    img.convert("RGB").save(out, format="PNG")
    return out.getvalue()
