"""Montagem do criativo final (sem IA) — composição com Pillow.

Recebe a base visual (gerada pelo gpt-image-2) e aplica template/layout simples:
scrim de legibilidade + camadas de texto (headline/subtítulo/CTA) + logo real.
Exporta no tamanho final do canal.

Decisão (MVP): render server-side com Pillow (síncrono, ~300ms, sem Chromium).
Reproduz o preview do front com fidelidade aproximada. Upgrade para Playwright
(WYSIWYG pixel-perfect) fica como evolução futura se necessário.
"""
from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

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
    posicao: str = "top_left",
) -> bytes:
    """Overlay INTELIGENTE da logo real sobre uma arte já gerada (fallback de fidelidade).

    Não é carimbo bruto: aplica a logo num badge translúcido arredondado com leve
    sombra, na área planejada (topo). Usado quando force_real_logo está ligado.
    """
    img = Image.open(BytesIO(base_png)).convert("RGBA")
    w, h = img.size
    logo = Image.open(BytesIO(logo_bytes)).convert("RGBA")

    lh = int(w * 0.12)
    lw = int(logo.width * lh / logo.height)
    max_lw = int(w * 0.38)
    if lw > max_lw:
        lw, lh = max_lw, int(logo.height * max_lw / logo.width)
    logo = logo.resize((max(1, lw), max(1, lh)), Image.LANCZOS)

    pad = int(lh * 0.30)
    badge = Image.new("RGBA", (lw + 2 * pad, lh + 2 * pad), (255, 255, 255, 0))
    bd = ImageDraw.Draw(badge)
    bd.rounded_rectangle(
        [0, 0, badge.width - 1, badge.height - 1],
        radius=int(badge.height * 0.28),
        fill=(255, 255, 255, 210),
    )
    badge.alpha_composite(logo, (pad, pad))

    margin = int(w * 0.045)
    if posicao == "top_center":
        x = (w - badge.width) // 2
    else:
        x = margin
    img.alpha_composite(badge, (x, margin))

    out = BytesIO()
    img.convert("RGB").save(out, format="PNG")
    return out.getvalue()
