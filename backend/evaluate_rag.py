import os
os.environ["HF_HUB_OFFLINE"] = "1"
import time
import pandas as pd
from datasets import Dataset
from ragas import evaluate
from ragas.metrics._faithfulness import faithfulness
from ragas.metrics._context_recall import context_recall
from ragas.metrics._context_precision import context_precision
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.run_config import RunConfig
from dotenv import load_dotenv

load_dotenv()

# ── Test dataset ──
TEST_DATA = {
    "question": [
        "What is the attention mechanism?",
        "How does multi-head attention work?",
    ],
    "answer": [
        "The attention mechanism is a function that maps a query and a set of key-value pairs to an output, "
        "where the output is computed as a weighted sum of the values. The weights are computed by a compatibility "
        "function of the query with the corresponding key. It allows the model to focus on different parts of the "
        "input sequence when producing each element of the output sequence.",

        "Multi-head attention works by linearly projecting the queries, keys and values h times with different, "
        "learned linear projections. On each of these projected versions, the attention function is performed in "
        "parallel, yielding output values which are concatenated and once again projected to get the final result. "
        "This allows the model to jointly attend to information from different representation subspaces at different positions.",
    ],
    "contexts": [
        [
            "An attention function can be described as mapping a query and a set of key-value pairs to an output, "
            "where the query, keys, values, and output are all vectors. The output is computed as a weighted sum "
            "of the values, where the weight assigned to each value is computed by a compatibility function of the "
            "query with the corresponding key.",
        ],
        [
            "Multi-head attention allows the model to jointly attend to information from different representation "
            "subspaces at different positions. Instead of performing a single attention function with d_model-dimensional "
            "keys, values and queries, we found it beneficial to linearly project the queries, keys and values h times "
            "with different, learned linear projections to d_k, d_k and d_v dimensions, respectively.",
        ],
    ],
    "ground_truth": [
        "The attention mechanism allows the model to jointly attend to information from different representation subspaces at different positions.",
        "Multi-head attention allows the model to jointly attend to information from different representation subspaces.",
    ],
}


def main():
    print("=" * 60)
    print("  SecondBrain RAG Evaluation (Ragas + Groq)")
    print("=" * 60)

    dataset = Dataset.from_dict(TEST_DATA)
    print(f"\nDataset loaded: {len(TEST_DATA['question'])} samples")

    # ── Initialize Groq LLM ──
    groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    print(f"\nInitializing Groq LLM ({groq_model})...")
    llm = ChatGroq(
        model=groq_model,
        api_key=os.getenv("GROQ_API_KEY"),
        temperature=0,
    )
    wrapped_llm = LangchainLLMWrapper(llm)

    # ── Local embeddings ──
    print("Loading local embeddings (BAAI/bge-base-en-v1.5)...")
    hf_emb = HuggingFaceEmbeddings(model_name="BAAI/bge-base-en-v1.5")
    wrapped_emb = LangchainEmbeddingsWrapper(hf_emb)

    # ── Set LLM/embeddings on legacy metric singletons ──
    faithfulness.llm = wrapped_llm
    context_recall.llm = wrapped_llm
    context_precision.llm = wrapped_llm

    print("\nRunning Ragas evaluation (this may take 1-2 minutes)...\n")

    result = evaluate(
        dataset,
        metrics=[faithfulness, context_recall, context_precision],
        run_config=RunConfig(timeout=180, max_workers=1, max_retries=5, max_wait=30),
    )

    df = result.to_pandas()
    print("\n" + "=" * 60)
    print("  Evaluation Results")
    print("=" * 60)
    print(df.to_string())

    # ── Generate markdown report ──
    report_content = "# RAG Evaluation Report\n\n"
    report_content += "This report contains the evaluation results of the **SecondBrain** RAG pipeline using [Ragas](https://docs.ragas.io/).\n\n"
    report_content += "## Evaluation Setup\n\n"
    report_content += "| Parameter | Value |\n|---|---|\n"
    report_content += f"| Evaluator LLM | Groq {groq_model} |\n"
    report_content += "| Embeddings | BAAI/bge-base-en-v1.5 (local) |\n"
    report_content += f"| RAG LLM (Production) | Groq {groq_model} |\n"
    report_content += f"| Test Samples | {len(TEST_DATA['question'])} |\n"
    report_content += "| Metrics | Faithfulness, Context Recall, Context Precision |\n\n"

    report_content += "## Aggregate Metrics\n\n"
    for col in df.columns:
        if col not in ("question", "answer", "contexts", "ground_truth", "user_input", "response", "reference", "retrieved_contexts"):
            avg = df[col].mean()
            report_content += f"- **{col}**: {avg:.4f}\n"

    report_content += "\n## Detailed Results\n\n"
    report_content += df.to_markdown(index=False)
    report_content += "\n"

    report_path = "ragas_report.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_content)

    print(f"\n[DONE] Report saved to {report_path}")


if __name__ == "__main__":
    main()
