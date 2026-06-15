# core/generator.py

import re
from typing import List, Dict, Generator
from core.llm_client import chat_model


def build_context(chunks: List[Dict]) -> str:
    """
    Assemble retrieved chunks into a numbered context block for the LLM.
    Order matters: highest relevance first, deduplication applied.
    """
    seen_texts = set()
    context_parts = []

    for i, chunk in enumerate(chunks):
        # Deduplicate by first 100 chars (catches near-duplicates)
        fingerprint = chunk["text"][:100].strip()
        if fingerprint in seen_texts:
            continue
        seen_texts.add(fingerprint)

        # Use parent_text for LLM context (wider context window = better answers)
        text = chunk.get("parent_text") or chunk["text"]
        doc_name = chunk.get("doc_name", "unknown")
        page = chunk.get("page_number", "?")

        context_parts.append(f"[{i+1}] Source: {doc_name}, p.{page}\n{text}")

    return "\n\n".join(context_parts)


def build_prompt(question: str, context: str, conversation_history: List[Dict] = None) -> str:
    """Build the full RAG prompt with context, history, and instructions."""

    history_text = ""
    if conversation_history:
        recent = conversation_history[-3:]  # last 3 turns only
        turns = []
        for turn in recent:
            role = "User" if turn["role"] == "user" else "Assistant"
            turns.append(f"{role}: {turn['content']}")
        history_text = "\nConversation history:\n" + "\n".join(turns) + "\n"

    return f"""You are SecondBrain, a highly intelligent and professional personal knowledge assistant.
You are tasked with answering a user's question accurately using ONLY the retrieved context provided below.

INSTRUCTIONS:
1. You MUST use Markdown bullet points (`* `) and paragraphs to structure your answer. NEVER output a single giant block of text.
2. You MUST use Markdown bold (`**text**`) for emphasis.
3. Base your facts ONLY on the provided context. For every factual claim, you MUST add a citation like [1] or [2] referencing the source number.
4. Maintain a professional, analytical, and objective tone.
5. If the context only answers part of the question, answer the part you DO know and clearly state that the specific details for the rest are not available in the documents.
6. Do NOT just say "I could not find that information" if you can answer at least a portion of the user's question.
7. ONLY say "I could not find information about this in your documents." if the context has absolutely NO relevance to any part of the question.
{history_text}
Context:
{context}

Question:
{question}

Detailed Answer:"""


def generate_stream(
    question: str,
    chunks: List[Dict],
    conversation_history: List[Dict] = None,
) -> Generator[str, None, None]:
    """
    Stream the generated answer token by token.
    """
    context = build_context(chunks)
    prompt = build_prompt(question, context, conversation_history)

    for chunk in chat_model.stream(prompt):
        if chunk.content:
            yield chunk.content


def parse_citations(answer: str, chunks: List[Dict]) -> Dict:
    """
    Extract citation references [1], [2] from answer text.
    Map them back to the source chunks.

    Returns:
        {
            "answer": original answer text,
            "citations": [
                {"ref": 1, "doc_name": "...", "page": 3, "text": "..."}
            ]
        }
    """
    citation_nums = set(int(n) for n in re.findall(r'\[(\d+)\]', answer))

    citations = []
    for num in sorted(citation_nums):
        idx = num - 1
        if 0 <= idx < len(chunks):
            chunk = chunks[idx]
            citations.append({
                "ref": num,
                "doc_name": chunk.get("doc_name", "unknown"),
                "page": chunk.get("page_number"),
                "text": chunk["text"][:200] + "..." if len(chunk["text"]) > 200 else chunk["text"],
                "similarity": chunk.get("rrf_score") or chunk.get("similarity", 0),
            })

    return {"answer": answer, "citations": citations}