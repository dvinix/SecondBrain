# RAG Evaluation Report

This report contains the evaluation results of the **SecondBrain** RAG pipeline using [Ragas](https://docs.ragas.io/).

## Evaluation Setup

| Parameter | Value |
|---|---|
| Evaluator LLM | Groq llama-3.3-70b-versatile |
| Embeddings | BAAI/bge-base-en-v1.5 (local) |
| RAG LLM (Production) | Groq llama-3.3-70b-versatile |
| Test Samples | 2 |
| Metrics | Faithfulness, Context Recall, Context Precision |

## Aggregate Metrics

- **faithfulness**: 0.6875
- **context_recall**: 0.5000
- **context_precision**: 1.0000

## Detailed Results

| user_input                          | retrieved_contexts                                                                                                                                                                                                                                                                                                                                                                                                       | response                                                                                                                                                                                                                                                                                                                                                                                                                                        | reference                                                                                                                                 |   faithfulness |   context_recall |   context_precision |
|:------------------------------------|:-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:------------------------------------------------------------------------------------------------------------------------------------------|---------------:|-----------------:|--------------------:|
| What is the attention mechanism?    | ['An attention function can be described as mapping a query and a set of key-value pairs to an output, where the query, keys, values, and output are all vectors. The output is computed as a weighted sum of the values, where the weight assigned to each value is computed by a compatibility function of the query with the corresponding key.']                                                                     | The attention mechanism is a function that maps a query and a set of key-value pairs to an output, where the output is computed as a weighted sum of the values. The weights are computed by a compatibility function of the query with the corresponding key. It allows the model to focus on different parts of the input sequence when producing each element of the output sequence.                                                        | The attention mechanism allows the model to jointly attend to information from different representation subspaces at different positions. |          0.75  |                0 |                   1 |
| How does multi-head attention work? | ['Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions. Instead of performing a single attention function with d_model-dimensional keys, values and queries, we found it beneficial to linearly project the queries, keys and values h times with different, learned linear projections to d_k, d_k and d_v dimensions, respectively.'] | Multi-head attention works by linearly projecting the queries, keys and values h times with different, learned linear projections. On each of these projected versions, the attention function is performed in parallel, yielding output values which are concatenated and once again projected to get the final result. This allows the model to jointly attend to information from different representation subspaces at different positions. | Multi-head attention allows the model to jointly attend to information from different representation subspaces.                           |          0.625 |                1 |                   1 |
