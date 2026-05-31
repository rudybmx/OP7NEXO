import unittest

from app.services.canal_labels import canal_provider, canal_provider_label


class CanalLabelsTest(unittest.TestCase):
    def test_evolution(self):
        self.assertEqual(canal_provider("whatsapp_evolution", {}), "evolution")
        self.assertEqual(
            canal_provider_label("whatsapp_evolution", {}), "WhatsApp Evolution"
        )

    def test_webhook_helena(self):
        cfg = {"webhook": {"provider": "helena"}}
        self.assertEqual(canal_provider("webhook", cfg), "helena")
        self.assertEqual(canal_provider_label("webhook", cfg), "Webhook Helena")

    def test_webhook_crm_externo_zapi(self):
        cfg = {"webhook": {"provider": "crm_externo_zapi"}}
        self.assertEqual(canal_provider("webhook", cfg), "crm_externo_zapi")
        self.assertEqual(
            canal_provider_label("webhook", cfg), "Webhook Qozt/Helena (Z-API)"
        )

    def test_webhook_generic_and_absent(self):
        self.assertEqual(
            canal_provider_label("webhook", {"webhook": {"provider": "generic"}}),
            "Webhook Genérico",
        )
        # provider ausente -> generic
        self.assertEqual(canal_provider("webhook", {}), "generic")
        self.assertEqual(canal_provider_label("webhook", {}), "Webhook Genérico")

    def test_future_tipos(self):
        self.assertEqual(canal_provider_label("whatsapp_oficial", {}), "WhatsApp Oficial")
        self.assertEqual(canal_provider_label("instagram", {}), "Instagram")
        self.assertEqual(canal_provider_label("facebook", {}), "Facebook")


if __name__ == "__main__":
    unittest.main()
