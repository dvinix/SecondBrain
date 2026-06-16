from db.client import get_client
from db.models import save_document, list_documents

print
# Run only after setting .env and creating tables
doc_id = save_document("test.pdf", "pdf", 1234)
print(f"Created doc: {doc_id}")
print("Documents:", list_documents())