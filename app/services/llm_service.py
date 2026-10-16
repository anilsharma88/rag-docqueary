from openai import AzureOpenAI

from app.config import settings


def generate_answer(
    question: str,
    contexts: list[str]
) -> str:
    if not settings.AZURE_OPENAI_ENDPOINT:
        raise RuntimeError("AZURE_OPENAI_ENDPOINT is not configured")
    if not settings.AZURE_OPENAI_DEPLOYMENT:
        raise RuntimeError("AZURE_OPENAI_DEPLOYMENT is not configured")
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not configured")

    client = AzureOpenAI(
        api_key=settings.OPENAI_API_KEY,
        azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
        api_version=settings.AZURE_OPENAI_API_VERSION,
    )

    labeled_contexts = []

    for index, context in enumerate(contexts, start=1):
        labeled_contexts.append(
            f"[Source {index}]\n{context}"
        )

    context_text = "\n\n---\n\n".join(labeled_contexts)

    prompt = f"""
You are a document question-answering assistant.

Answer the user's question using ONLY the document context provided below.

When using information from a source, cite it using:
[Source 1], [Source 2], etc.

Do not invent information that is not present in the sources.

If the answer cannot be found in the context, say:
"I could not find that information in the document."

Document Context:

{context_text}

Question:
{question}

Answer:
"""

    response = client.chat.completions.create(
        model=settings.AZURE_OPENAI_DEPLOYMENT,
        messages=[{"role": "user", "content": prompt}],
    )

    return response.choices[0].message.content or ""