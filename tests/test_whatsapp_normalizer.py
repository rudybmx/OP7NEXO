from app.services.whatsapp_normalizer import (
    normalize_connection_event,
    normalize_event_type,
    normalize_media_payload,
    normalize_message_event,
    normalize_receipt_event,
)


def test_normalize_evolution_go_message_payload():
    payload = {
        "instanceName": "op7-instance",
        "data": {
            "Info": {
                "Chat": "5511999999999@s.whatsapp.net",
                "Sender": "5511999999999@s.whatsapp.net",
                "IsFromMe": False,
                "ID": "go-msg-1",
                "PushName": "Lead",
                "Timestamp": 1_700_000_000,
                "Type": "text",
            },
            "Message": {"conversation": "Oi"},
        },
    }

    event = normalize_message_event(payload, "Message")

    assert event.event_type == "MESSAGE"
    assert event.instance == "op7-instance"
    assert event.remote_jid == "5511999999999@s.whatsapp.net"
    assert event.sender_jid == "5511999999999@s.whatsapp.net"
    assert event.evolution_msg_id == "go-msg-1"
    assert event.message_type == "conversation"
    assert event.text == "Oi"
    assert not event.is_group


def test_normalize_legacy_messages_upsert_media_payload():
    payload = {
        "instance": "legacy-instance",
        "data": {
            "key": {
                "remoteJid": "5511888888888@s.whatsapp.net",
                "fromMe": False,
                "id": "legacy-msg-1",
            },
            "pushName": "Maria",
            "messageTimestamp": "1700000001",
            "messageType": "imageMessage",
            "message": {
                "imageMessage": {
                    "caption": "Foto do pedido",
                    "mimetype": "image/jpeg",
                    "url": "https://example.test/image.jpg",
                    "fileName": "pedido.jpg",
                }
            },
        },
    }

    event = normalize_message_event(payload, "MESSAGES_UPSERT")
    media = normalize_media_payload(payload)

    assert event.event_type == "MESSAGES_UPSERT"
    assert event.message_type == "imageMessage"
    assert event.text == "Foto do pedido"
    assert event.media.is_media
    assert media.url == "https://example.test/image.jpg"
    assert media.mimetype == "image/jpeg"
    assert media.filename == "pedido.jpg"


def test_normalize_group_participant_and_mention():
    payload = {
        "data": {
            "Info": {
                "Chat": "120363000000000000@g.us",
                "Sender": "5511777777777@s.whatsapp.net",
                "IsGroup": True,
                "ID": "group-msg-1",
                "PushName": "Participante",
                "Timestamp": 1_700_000_002,
            },
            "Message": {
                "extendedTextMessage": {
                    "text": "@Atendimento preciso de ajuda",
                    "contextInfo": {
                        "mentionedJid": ["5511666666666@s.whatsapp.net"],
                    },
                },
            },
        },
    }

    event = normalize_message_event(payload, "Message")

    assert event.is_group
    assert event.remote_jid == "120363000000000000@g.us"
    assert event.participant_jid == "5511777777777@s.whatsapp.net"
    assert event.sender_jid == "5511777777777@s.whatsapp.net"
    assert event.mentioned_jids == ["5511666666666@s.whatsapp.net"]
    assert event.is_channel_mentioned("+55 11 6666-6666")


def test_normalize_lid_with_sender_pn():
    payload = {
        "data": {
            "Info": {
                "Chat": "1234567890@lid",
                "Sender": "1234567890@lid",
                "SenderPn": "5511987654321@s.whatsapp.net",
                "ID": "lid-msg-1",
                "Timestamp": 1_700_000_003,
            },
            "Message": {"conversation": "Mensagem via LID"},
        },
    }

    event = normalize_message_event(payload, "MESSAGES_UPSERT")

    assert event.is_lid
    assert event.remote_jid == "1234567890@lid"
    assert event.sender_pn == "5511987654321@s.whatsapp.net"


def test_normalize_message_event_marks_fallback_timestamp_when_missing():
    payload = {
        "data": {
            "Info": {
                "Chat": "5511888888888@s.whatsapp.net",
                "Sender": "5511888888888@s.whatsapp.net",
                "IsFromMe": False,
                "ID": "",
                "PushName": "Lead",
            },
            "Message": {"conversation": "Oi"},
        },
    }

    event = normalize_message_event(payload, "Message")

    assert event.received_at_source == "fallback"
    assert event.received_at.tzinfo is not None


def test_normalize_receipt_and_messages_update():
    receipt = normalize_receipt_event(
        {
            "data": {
                "key": {"remoteJid": "5511999999999@s.whatsapp.net", "id": "msg-1"},
                "status": "read",
            }
        },
        "Receipt",
    )
    update = normalize_receipt_event(
        {
            "data": {
                "remoteJid": "5511999999999@s.whatsapp.net",
                "messageIds": [{"id": "msg-2"}, "msg-3"],
            }
        },
        "MESSAGES_UPDATE",
    )

    assert receipt.event_type == "RECEIPT"
    assert receipt.status == "read"
    assert receipt.message_ids == ["msg-1"]
    assert update.status == "delivered"
    assert update.message_ids == ["msg-2", "msg-3"]


def test_normalize_connection_events():
    connected = normalize_connection_event({"data": {"state": "open", "number": "5511000000000"}}, "Connected")
    qrcode = normalize_connection_event({"data": {"qrcode": {"base64": "qr-base64"}}}, "QRCode")
    logged_out = normalize_connection_event({"data": {"Status": "loggedout"}}, "LoggedOut")

    assert normalize_event_type("messages.upsert") == "MESSAGES_UPSERT"
    assert connected.state == "connected"
    assert connected.number == "5511000000000"
    assert qrcode.state == "connecting"
    assert qrcode.qr_code == "qr-base64"
    assert logged_out.state == "disconnected"
