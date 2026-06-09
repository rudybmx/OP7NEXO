"""Validação e normalização de uploads de imagem (referência, logo, máscara).

Toda imagem que entra no Estúdio de Criativos passa por aqui ANTES de ir ao
MinIO ou à OpenAI: valida o tipo real (não confia em extensão/Content-Type),
corrige orientação via EXIF, remove metadados e normaliza o arquivo. Para
máscara de edição, exige mesmo tamanho da base e canal alpha.
"""
from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageOps

# Formatos aceitos -> mime de saída normalizado
_FORMATO_MIME = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}

MAX_UPLOAD_MB = 15
MAX_PIXELS = 8_294_400  # ~ limite do gpt-image-2 (3:1 até 8.3 MP)


class UploadValidationError(Exception):
    """Erro de validação amigável; carrega um error_code do contrato."""

    def __init__(self, error_code: str, message: str):
        self.error_code = error_code
        self.message = message
        super().__init__(message)


def _abrir(content: bytes, *, error_code: str) -> Image.Image:
    if not content:
        raise UploadValidationError(error_code, "Arquivo vazio.")
    if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
        raise UploadValidationError(
            error_code, f"Arquivo maior que {MAX_UPLOAD_MB}MB."
        )
    try:
        img = Image.open(BytesIO(content))
        img.load()
    except Exception:
        raise UploadValidationError(error_code, "Arquivo de imagem inválido ou corrompido.")
    if (img.format or "").upper() not in _FORMATO_MIME:
        raise UploadValidationError(
            error_code,
            "Formato não suportado. Use PNG, JPEG ou WEBP.",
        )
    if img.width * img.height > MAX_PIXELS:
        raise UploadValidationError(error_code, "Imagem com resolução acima do permitido.")
    return img


def validar_e_normalizar_imagem(
    content: bytes, *, error_code: str = "invalid_reference"
) -> tuple[bytes, str, int, int]:
    """Valida tipo real + tamanho, corrige EXIF, remove metadados e re-serializa.

    Retorna (bytes_normalizados, mime, width, height). Levanta UploadValidationError.
    """
    img = _abrir(content, error_code=error_code)
    img = ImageOps.exif_transpose(img)  # corrige orientação

    tem_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    if tem_alpha:
        img = img.convert("RGBA")
        out_fmt, mime = "PNG", "image/png"
    else:
        img = img.convert("RGB")
        out_fmt, mime = "PNG", "image/png"

    buf = BytesIO()
    img.save(buf, format=out_fmt)  # save sem exif/icc => metadados removidos
    return buf.getvalue(), mime, img.width, img.height


def validar_mascara(
    base_bytes: bytes, mask_bytes: bytes
) -> tuple[bytes, int, int]:
    """Valida a máscara de edição contra a base.

    Exige mesmo tamanho da base e canal alpha (áreas transparentes = região a
    editar, conforme images.edit). Retorna (mask_png_bytes, width, height).
    """
    base = _abrir(base_bytes, error_code="invalid_reference")
    mask = _abrir(mask_bytes, error_code="invalid_mask")
    mask = ImageOps.exif_transpose(mask)

    if (mask.width, mask.height) != (base.width, base.height):
        raise UploadValidationError(
            "invalid_mask",
            "A máscara precisa ter exatamente o mesmo tamanho da imagem base.",
        )

    tem_alpha = mask.mode in ("RGBA", "LA") or (
        mask.mode == "P" and "transparency" in mask.info
    )
    if not tem_alpha:
        raise UploadValidationError(
            "invalid_mask",
            "A máscara precisa ter canal de transparência (alpha).",
        )

    mask = mask.convert("RGBA")
    buf = BytesIO()
    mask.save(buf, format="PNG")
    return buf.getvalue(), mask.width, mask.height
