# db/vectorstore.py

from langchain_community.vectorstores import SupabaseVectorStore
from core.embedder import embedder
from db.client import get_client


def get_vectorstore() -> SupabaseVectorStore:
    """
    Returns a LangChain SupabaseVectorStore bound to the `chunks` table.

    Table/column mapping (must match schema.sql):
        table_name:     "chunks"
        query_name:      "match_chunks"   (the SQL function from schema.sql)
        content column:  "text"            (page_content)
        metadata column: "metadata"        (jsonb — see note below)
        embedding col:   "embedding"

    NOTE: SupabaseVectorStore expects a jsonb `metadata` column. Our
    schema.sql stores doc_id, page_number, chunk_index as separate
    typed columns instead (better for SQL filtering/joins). To use
    SupabaseVectorStore's add_documents() directly, either:
      (a) add a `metadata jsonb` column to `chunks`, or
      (b) write documents via db/chunks.py (Step 8) and use this
          vectorstore ONLY for similarity_search(), not inserts.

    This project uses option (b) — db/chunks.py handles inserts with
    typed columns; get_vectorstore() is used for ad-hoc similarity
    search and LangGraph retriever nodes.
    """
    return SupabaseVectorStore(
        client=get_client(),
        embedding=embedder.lc_embeddings,
        table_name="chunks",
        query_name="match_chunks",
    )