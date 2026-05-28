from pathlib import Path
import importlib.util


def _load_migration():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "046_fix_whatsapp_vector_documents_view.py"
    )
    spec = importlib.util.spec_from_file_location("migration_046", migration_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_whatsapp_vector_view_migration_contract(monkeypatch):
    module = _load_migration()
    executed_sql: list[str] = []

    monkeypatch.setattr(module.op, "execute", lambda statement: executed_sql.append(str(statement)))

    module.upgrade()

    sql = "\n".join(executed_sql)
    assert "CREATE OR REPLACE VIEW public.vw_crm_whatsapp_vector_documents" in sql
    assert "'message'::text AS document_type" in sql
    assert "'conversation_summary'::text AS document_type" in sql
    assert "m.payload" not in sql
    assert "raw_payload" not in sql
    assert "COALESCE(m.workspace_id, c.workspace_id, ct.workspace_id) AS workspace_id" in sql
    assert "COALESCE(m.embedding_status, 'pendente') AS embedding_status" in sql
    assert "workspace_id IS NOT NULL" in sql
    assert "lower(btrim(COALESCE(m.conteudo, ''))) IN ('[mídia]', '[midia]', '[media]')" in sql
    assert "btrim(regexp_replace(COALESCE(raw_text, '')," in sql
    assert "'\\s+'" in sql
