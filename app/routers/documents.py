from app.services.llm_service import generate_answer
from app.models import Document, DocumentChunk

from app.services.pdf_service import extract_text_from_pdf
from app.services.chunk_service import chunk_text
from pathlib import Path
from uuid import uuid4
import logging
import hmac
import subprocess
from openai import AuthenticationError, NotFoundError
from pydantic import BaseModel, Field

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings

from app.services.embedding_service import (
    generate_embeddings,
    generate_embedding
)



router = APIRouter(
    prefix="/documents",
    tags=["Documents"]
)
logger = logging.getLogger(__name__)
basic_auth = HTTPBasic(auto_error=False)

UPLOAD_DIR = Path("uploads/documents")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

class SearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=3, ge=1, le=10)

class AskRequest(BaseModel):
    question: str
    top_k: int = Field(default=3, ge=1, le=10)

def require_admin(
    credentials: HTTPBasicCredentials | None = Depends(basic_auth),
) -> str:
    valid_username = credentials is not None and hmac.compare_digest(
        credentials.username,
        settings.ADMIN_USERNAME,
    )
    valid_password = credentials is not None and hmac.compare_digest(
        credentials.password,
        settings.ADMIN_PASSWORD,
    )
    if not (valid_username and valid_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin login required",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

def extract_document_text(file_path: Path) -> str:
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        return extract_text_from_pdf(file_path)
    if suffix == ".txt":
        return file_path.read_text(encoding="utf-8-sig", errors="replace")
    if suffix == ".doc":
        result = subprocess.run(
            ["antiword", str(file_path)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
            check=False,
        )
        if result.returncode != 0:
            raise ValueError("Unable to read this Word document")
        return result.stdout
    raise ValueError("Supported file types are PDF, TXT, and DOC")

@router.get("/admin/verify")
def verify_admin(_: str = Depends(require_admin)):
    return {"authenticated": True}

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    original_filename = file.filename or ""
    extension = Path(original_filename).suffix.lower()
    if extension not in {".pdf", ".txt", ".doc"}:
        raise HTTPException(
            status_code=400,
            detail="Supported file types are PDF, TXT, and DOC"
        )

    contents = await file.read()

    # Reject empty files
    if not contents:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty"
        )

    # Maximum 10 MB
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File size must be less than 10 MB"
        )

    stored_filename = f"{uuid4().hex}{extension}"
    file_path = UPLOAD_DIR / stored_filename

    try:
        # Save PDF
        with open(file_path, "wb") as buffer:
            buffer.write(contents)

        # Extract text
        try:
            extracted_text = extract_document_text(file_path)
        except (ValueError, subprocess.SubprocessError, OSError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        # Reject image-only / empty-text PDFs for now
        if not extracted_text.strip():
            raise HTTPException(
                status_code=400,
                detail="No readable text found in PDF"
            )

        # Chunk document
        chunks = chunk_text(extracted_text)

        if not chunks:
            raise HTTPException(
                status_code=400,
                detail="Unable to create document chunks"
            )

        # Generate embeddings
        try:
            embeddings = generate_embeddings(chunks)
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="Failed to generate document embeddings"
            )

        # Create document
        document = Document(
            filename=original_filename,
            file_path=str(file_path),
            content_type=file.content_type
        )

        db.add(document)

        # Get document.id without committing yet
        db.flush()

        # Save chunks + vectors
        for index, (chunk, embedding) in enumerate(
            zip(chunks, embeddings)
        ):
            document_chunk = DocumentChunk(
                document_id=document.id,
                chunk_index=index,
                content=chunk,
                embedding=embedding
            )

            db.add(document_chunk)

        # Commit everything together
        db.commit()
        db.refresh(document)

        return {
            "message": "Document uploaded successfully",
            "document": {
                "id": document.id,
                "filename": document.filename,
                "content_type": document.content_type,
                "uploaded_at": document.uploaded_at
            },
            "extraction": {
                "characters_extracted": len(extracted_text),
                "chunks_created": len(chunks),
                "embeddings_stored": len(embeddings)
            }
        }

    except HTTPException:
        db.rollback()

        if file_path.exists():
            file_path.unlink()

        raise

    except Exception:
        db.rollback()

        if file_path.exists():
            file_path.unlink()

        raise HTTPException(
            status_code=500,
            detail="Unexpected error while processing document"
        )

@router.post("/{document_id}/search")
def search_document(
    document_id: int,
    request: SearchRequest,
    db: Session = Depends(get_db)
):

    # Make sure the document exists
    document = (
        db.query(Document)
        .filter(Document.id == document_id)
        .first()
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    # Convert the user's question into a vector
    query_embedding = generate_embedding(request.query)

    # Calculate cosine distance
    distance = DocumentChunk.embedding.cosine_distance(
        query_embedding
    )

    # Find the closest chunks
    results = (
        db.query(
            DocumentChunk,
            distance.label("distance")
        )
        .filter(
            DocumentChunk.document_id == document_id
        )
        .order_by(distance)
        .limit(request.top_k)
        .all()
    )

    matches = []

    for chunk, distance_value in results:

        matches.append({
            "chunk_index": chunk.chunk_index,
            "content": chunk.content,
            "similarity": round(
                1 - float(distance_value),
                4
            )
        })

    return {
        "query": request.query,
        "document_id": document_id,
        "matches": matches
    }

@router.post("/{document_id}/ask")
def ask_document(
    document_id: int,
    request: AskRequest,
    db: Session = Depends(get_db)
):
    document = (
        db.query(Document)
        .filter(Document.id == document_id)
        .first()
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    query_embedding = generate_embedding(
        request.question
    )

    distance = DocumentChunk.embedding.cosine_distance(
        query_embedding
    )

    results = (
        db.query(
            DocumentChunk,
            distance.label("distance")
        )
        .filter(
            DocumentChunk.document_id == document_id
        )
        .order_by(distance)
        .limit(request.top_k)
        .all()
    )

    contexts = [
        chunk.content
        for chunk, _ in results
    ]
    if not contexts:
        raise HTTPException(
            status_code=400,
            detail="No indexed content found for this document"
        ) 

    sources = []

    for source_number, (chunk, distance_value) in enumerate(
        results,
        start=1
    ):
        sources.append({
            "source": source_number,
            "chunk_index": chunk.chunk_index,
            "similarity": round(
                1 - float(distance_value),
                4
            ),
            "content": chunk.content
        })
    try:
        answer = generate_answer(
            question=request.question,
            contexts=contexts
        )
    except RuntimeError as exc:
        logger.exception("Azure OpenAI configuration error")
        raise HTTPException(
            status_code=500,
            detail=str(exc)
        )
    except NotFoundError as exc:
        logger.exception("Azure OpenAI deployment was not found")
        raise HTTPException(
            status_code=502,
            detail="Azure OpenAI deployment was not found. Set AZURE_OPENAI_DEPLOYMENT to the exact deployment name in your Azure resource."
        ) from exc
    except AuthenticationError as exc:
        logger.exception("Azure OpenAI rejected the key or endpoint")
        raise HTTPException(
            status_code=502,
            detail="Azure OpenAI rejected the configured key or endpoint. Verify OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT for the same Azure resource."
        ) from exc
    except Exception:
        logger.exception("Azure OpenAI request failed")
        raise HTTPException(
            status_code=502,
            detail="LLM service is currently unavailable"
        )

    return {
        "document_id": document_id,
        "filename": document.filename,
        "question": request.question,
        "answer": answer,
        "chunks_used": len(contexts),
        "sources": sources
    }

@router.get("")
def get_documents(
    db: Session = Depends(get_db)
):
    documents = (
        db.query(Document)
        .order_by(Document.uploaded_at.desc())
        .all()
    )

    return {
        "documents": [
            {
                "id": document.id,
                "filename": document.filename,
                "content_type": document.content_type,
                "uploaded_at": document.uploaded_at
            }
            for document in documents
        ]
    }

@router.get("/{document_id}")
def get_document(
    document_id: int,
    db: Session = Depends(get_db)
):
    document = (
        db.query(Document)
        .filter(Document.id == document_id)
        .first()
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    chunk_count = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == document_id)
        .count()
    )

    return {
        "id": document.id,
        "filename": document.filename,
        "content_type": document.content_type,
        "uploaded_at": document.uploaded_at,
        "chunks": chunk_count
    }

@router.delete("/{document_id}")
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    document = (
        db.query(Document)
        .filter(Document.id == document_id)
        .first()
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    file_path = Path(document.file_path)

    # Delete document from database.
    # document_chunks are automatically removed
    # because of ON DELETE CASCADE.
    db.delete(document)
    db.commit()

    # Delete the actual PDF from disk
    if file_path.exists():
        file_path.unlink()

    return {
        "message": "Document deleted successfully",
        "document_id": document_id
    }