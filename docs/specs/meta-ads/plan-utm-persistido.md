# Meta Ads — UTM Persistido em Colunas

## Decisão

UTM/tracking era extraído de `raw_payload` (JSONB) a cada query via `extrair_tracking_info()`.
Agora os campos são persistidos como colunas próprias durante o sync.

## Por quê

- Permite filtrar/indexar por UTM no futuro sem JSON parsing
- Garante rastreabilidade mesmo se raw_payload for corrompido
- Elimina parsing custoso em cada chamada ao endpoint `/meta/catalogo/criativos`

## Campos adicionados a `meta_creatives_catalog`

| Coluna | Tipo | Fonte |
|--------|------|-------|
| `headline` | TEXT | `link_data.name`, cards, `creative.name` |
| `destination_url` | TEXT | `link_data.link`, `video_data.link`, cards |
| `url_tags` | TEXT | `creative.url_tags` |
| `utm_source` | VARCHAR(100) | Parse de `url_tags` + `destination_url` |
| `utm_medium` | VARCHAR(100) | idem |
| `utm_campaign` | VARCHAR(150) | idem |
| `utm_content` | VARCHAR(200) | idem |
| `utm_term` | VARCHAR(200) | idem |

## Compatibilidade

Registros antigos têm colunas NULL. A API detecta via `utm_source IS NULL AND destination_url IS NULL`
e faz fallback para `extrair_tracking_info(raw_payload)` — sem regressão.

## Arquivos modificados

- `alembic/versions/036_meta_creatives_utm.py` — migration
- `app/services/meta_sync.py` — upsert com tracking extraído no sync
- `app/services/meta_tracking.py` — melhoria: varre todos os cards carousel
- `app/api/meta_catalog.py` — SELECT com colunas + fallback para registros antigos
