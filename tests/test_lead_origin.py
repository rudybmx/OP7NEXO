from app.services.lead_origin import extract_lead_origin, has_lead_origin


def test_extract_meta_referral_origin():
    origin = extract_lead_origin(
        {
            "referral": {
                "source_id": "ad-1",
                "ctwa_clid": "clid-1",
                "headline": "Campanha Teste",
                "source_url": "https://fb.test/ad",
                "media_type": "image",
            }
        },
        {},
        "Oi",
    )

    assert origin["source"] == "meta_referral"
    assert origin["utm_source"] == "meta_ads"
    assert origin["utm_medium"] == "cpc"
    assert origin["campanha_origem"] == "Campanha Teste"
    assert origin["meta_ad_id"] == "ad-1"
    assert has_lead_origin(origin)


def test_extract_message_campaign_origin():
    origin = extract_lead_origin({}, {}, "vim pela campanha: Black Friday")

    assert origin["source"] == "message_text"
    assert origin["utm_source"] == "whatsapp"
    assert origin["utm_medium"] == "organic"
    assert origin["utm_campaign"] == "Black Friday"
    assert has_lead_origin(origin)


def test_empty_origin_is_false():
    origin = extract_lead_origin({}, {}, "olá")

    assert not has_lead_origin(origin)
