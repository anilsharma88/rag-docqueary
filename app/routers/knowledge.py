import logging

from fastapi import APIRouter, Depends, HTTPException
from openai import AuthenticationError, NotFoundError, RateLimitError
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models import Document, DocumentChunk, KnowledgeQueryEvent
from app.services.embedding_service import generate_embedding
from app.services.llm_service import generate_answer
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/knowledge", tags=["Knowledge assistant"])


class KnowledgeQuery(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    category: str | None = None
    top_k: int = Field(default=5, ge=1, le=10)


@router.post("/query")
def query_knowledge(request: KnowledgeQuery, db: Session = Depends(get_db)):
    embedding = generate_embedding(request.question)
    distance = DocumentChunk.embedding.cosine_distance(embedding)
    query = (
        db.query(Document, DocumentChunk, distance.label("distance"))
        .join(DocumentChunk, DocumentChunk.document_id == Document.id)
        .filter(
            Document.is_cv.is_(False),
            Document.access_group == "All employees",
            Document.confidentiality.in_(["Public", "Internal"]),
            Document.status == "Indexed",
        )
    )
    if request.category:
        query = query.filter(Document.category == request.category)
    results = query.order_by(distance).limit(request.top_k).all()
    if not results:
        db.add(KnowledgeQueryEvent(category=request.category))
        db.commit()
        return {
            "question": request.question,
            "category": request.category,
            "answer": "No document found.",
            "chunks_used": 0,
            "sources": [],
        }

    contexts = [chunk.content for _, chunk, _ in results]
    sources = [
        {
            "source": index,
            "document_id": document.id,
            "title": document.title or document.filename,
            "filename": document.filename,
            "category": document.category,
            "subcategory": document.subcategory,
            "chunk_index": chunk.chunk_index,
            "similarity": round(1 - float(distance_value), 4),
            "content": chunk.content,
        }
        for index, (document, chunk, distance_value) in enumerate(results, start=1)
    ]
    try:
        answer = generate_answer(request.question, contexts)
    except RuntimeError as exc:
        logger.exception("Azure OpenAI configuration error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except NotFoundError as exc:
        logger.exception("Azure OpenAI deployment was not found")
        raise HTTPException(status_code=502, detail="Azure OpenAI deployment was not found.") from exc
    except AuthenticationError as exc:
        logger.exception("Azure OpenAI rejected the key or endpoint")
        raise HTTPException(status_code=502, detail="Azure OpenAI rejected the configured key or endpoint.") from exc
    except RateLimitError as exc:
        logger.warning("Azure OpenAI rate limit reached")
        raise HTTPException(status_code=429, detail="The AI service is temporarily at capacity. Please retry in a moment.") from exc
    except Exception as exc:
        logger.exception("Azure OpenAI request failed")
        raise HTTPException(status_code=502, detail="LLM service is currently unavailable") from exc

    db.add(KnowledgeQueryEvent(category=request.category))
    db.commit()

    return {
        "question": request.question,
        "category": request.category,
        "answer": answer,
        "chunks_used": len(contexts),
        "sources": sources,
    }
