from app.services.llm_service import generate_answer
from app.models import AuditEvent, Document, DocumentChunk, DocumentVersion, KnowledgeQueryEvent

from app.services.pdf_service import extract_text_from_pdf
from app.services.chunk_service import chunk_text
from pathlib import Path
from uuid import uuid4
import logging
import hmac
import subprocess
from openai import AuthenticationError, NotFoundError, RateLimitError
from pydantic import BaseModel, Field

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status, Form
from fastapi.responses import FileResponse
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

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

CATEGORY_TREE = [
    {"name": "Product", "children": ["Online Store", "Games", "Pricing", "Product Catalog", "Product Documentation", "Release Notes", "Product Roadmap"]},
    {"name": "HR Policy", "children": ["Leave", "Encashment", "Hiring Process", "CV Upload", "Recruitment", "Job Descriptions", "Employee Handbook", "Onboarding", "Training and Development", "Benefits and Compensation"]},
    {"name": "Service & Support", "children": ["Tickets", "Resolving Issues", "Troubleshooting Guides", "Knowledge Base", "Incident Reports", "Service-Level Agreements", "FAQs", "Escalation Procedures"]},
    {"name": "Finance Data", "children": ["Budgets", "Invoices", "Expenses", "Purchase Orders", "Financial Reports", "Forecasts", "Billing", "Tax Documentation"]},
    {"name": "Engineering & DevOps", "children": ["CI/CD", "Terraform and Infrastructure as Code", "Kubernetes", "Cloud Operations", "Architecture", "Runbooks", "Disaster Recovery", "Release Management"]},
    {"name": "Security & Compliance", "children": ["Security Policies", "Vulnerability Management", "Risk Assessments", "Audit Evidence", "Compliance Reports", "Incident Response", "Data Protection"]},
    {"name": "Legal & Contracts", "children": ["Contracts", "Vendor Agreements", "NDAs", "Regulatory Documentation"]},
    {"name": "Operations & Projects", "children": ["Standard Operating Procedures", "Project Plans", "Meeting Notes", "Status Reports"]},
    {"name": "Sales & Marketing", "children": ["Sales Playbooks", "Customer Proposals", "Marketing Materials", "Market Research"]},
    {"name": "IT & Assets", "children": ["Asset Inventory", "Software Licenses", "Hardware Documentation", "IT Support Procedures", "Change Management"]},
]

class SearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=3, ge=1, le=10)

class AskRequest(BaseModel):
    question: str
    top_k: int = Field(default=3, ge=1, le=10)
    category: str | None = None

class CandidateSearchRequest(BaseModel):
    required_skills: list[str] = Field(default_factory=list)
    optional_skills: list[str] = Field(default_factory=list)
    minimum_experience: float | None = None
    maximum_experience: float | None = None
    certifications: list[str] = Field(default_factory=list)
    target_role: str = ""
    education: str = ""
    review_status: str = "All"

class CandidateReviewRequest(BaseModel):
    review_status: str = Field(pattern="^(Needs review|Shortlisted|Interview|Rejected)$")

class DocumentUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    subcategory: str | None = None
    department: str | None = None
    tags: list[str] | None = None
    confidentiality: str | None = None
    access_group: str | None = None

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
    if suffix == ".docx":
        from docx import Document as WordDocument

        document = WordDocument(file_path)
        return "\n".join(paragraph.text for paragraph in document.paragraphs)
    if suffix in {".xlsx", ".xlsm"}:
        from openpyxl import load_workbook

        workbook = load_workbook(file_path, read_only=True, data_only=True)
        rows = []
        for sheet in workbook.worksheets:
            rows.append(sheet.title)
            rows.extend(" | ".join(str(value) for value in row if value is not None) for row in sheet.iter_rows(values_only=True))
        return "\n".join(rows)
    if suffix == ".xls":
        import xlrd

        workbook = xlrd.open_workbook(file_path)
        rows = []
        for sheet in workbook.sheets():
            rows.append(sheet.name)
            rows.extend(" | ".join(str(value) for value in sheet.row_values(index) if value not in (None, "")) for index in range(sheet.nrows))
        return "\n".join(rows)
    raise ValueError("Supported file types are PDF, TXT, DOC, DOCX, XLS, XLSX, and XLSM")

@router.get("/admin/verify")
def verify_admin(_: str = Depends(require_admin)):
    return {"authenticated": True}

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(""),
    description: str = Form(""),
    category: str = Form("Operations & Projects"),
    subcategory: str = Form(""),
    department: str = Form(""),
    tags: str = Form(""),
    confidentiality: str = Form("Internal"),
    access_group: str = Form("All employees"),
    is_cv: bool = Form(False),
    candidate_name: str = Form(""),
    candidate_role: str = Form(""),
    candidate_skills: str = Form(""),
    experience_years: float | None = Form(None),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    original_filename = file.filename or ""
    extension = Path(original_filename).suffix.lower()
    if extension not in {".pdf", ".txt", ".doc", ".docx", ".xls", ".xlsx", ".xlsm"}:
        raise HTTPException(
            status_code=400,
            detail="Supported file types are PDF, TXT, DOC, DOCX, XLS, XLSX, and XLSM"
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
            detail="File size must be less than 20 MB"
        )

    if is_cv and extension not in {".pdf", ".txt"}:
        raise HTTPException(status_code=400, detail="CV uploads must be PDF or TXT")

    if extension == ".pdf" and not contents.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid PDF")
    if extension in {".docx", ".xlsx", ".xlsm"} and not contents.startswith(b"PK\x03\x04"):
        raise HTTPException(status_code=400, detail="The uploaded Office file is invalid")
    if extension == ".xls" and not contents.startswith(bytes.fromhex("D0CF11E0A1B11AE1")):
        raise HTTPException(status_code=400, detail="The uploaded Excel file is invalid")

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
            content_type=file.content_type or "application/octet-stream",
            title=title.strip() or original_filename,
            description=description.strip() or None,
            category="HR Policy" if is_cv else category,
            subcategory="CV Upload" if is_cv else (subcategory or None),
            department=department.strip() or None,
            tags=tags.strip() or None,
            confidentiality="Restricted" if is_cv else confidentiality,
            access_group="HR" if is_cv else access_group,
            is_cv=is_cv,
            candidate_name=candidate_name.strip() or None,
            candidate_role=candidate_role.strip() or None,
            candidate_skills=candidate_skills.strip() or None,
            experience_years=experience_years,
            review_status="Needs review" if is_cv else None,
        )

        db.add(document)

        # Get document.id without committing yet
        db.flush()
        db.add(DocumentVersion(
            document_id=document.id,
            version=1,
            filename=original_filename,
            file_path=str(file_path),
            actor=settings.ADMIN_USERNAME,
        ))

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

        db.add(AuditEvent(
            actor=settings.ADMIN_USERNAME,
            action="upload_cv" if is_cv else "upload_document",
            object_type="document",
            object_id=document.id,
            detail=original_filename,
        ))
        # Commit document, chunks, and audit event together.
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

@router.get("/categories")
def get_categories():
    return {"categories": CATEGORY_TREE}

def document_payload(document: Document) -> dict:
    return {
        "id": document.id,
        "filename": document.filename,
        "title": document.title or document.filename,
        "description": document.description,
        "content_type": document.content_type,
        "category": document.category,
        "subcategory": document.subcategory,
        "department": document.department,
        "tags": [tag.strip() for tag in (document.tags or "").split(",") if tag.strip()],
        "confidentiality": document.confidentiality,
        "access_group": document.access_group,
        "version": document.version,
        "status": document.status,
        "uploaded_at": document.uploaded_at,
        "is_cv": document.is_cv,
    }

@router.get("/admin/documents")
def list_admin_documents(
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    documents = db.query(Document).order_by(Document.uploaded_at.desc()).all()
    return {"documents": [document_payload(document) for document in documents]}

@router.patch("/admin/documents/{document_id}")
def update_document_metadata(
    document_id: int,
    request: DocumentUpdateRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    document = db.query(Document).filter(Document.id == document_id, Document.is_cv.is_(False)).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    changes = request.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(document, field, ",".join(value) if field == "tags" and value is not None else value)
    db.add(AuditEvent(actor=settings.ADMIN_USERNAME, action="update_document", object_type="document", object_id=document.id, detail=",".join(changes)))
    db.commit()
    db.refresh(document)
    return document_payload(document)

@router.get("/admin/documents/{document_id}/versions")
def get_document_versions(
    document_id: int,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    document = db.query(Document).filter(Document.id == document_id, Document.is_cv.is_(False)).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    versions = db.query(DocumentVersion).filter(DocumentVersion.document_id == document_id).order_by(DocumentVersion.version.desc()).all()
    return {"versions": [{"version": item.version, "filename": item.filename, "created_at": item.created_at, "actor": item.actor} for item in versions]}

@router.get("/admin/documents/{document_id}/download")
def download_document(
    document_id: int,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    document = db.query(Document).filter(Document.id == document_id, Document.is_cv.is_(False)).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    file_path = Path(document.file_path)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Stored file is unavailable")
    return FileResponse(file_path, filename=document.filename, media_type=document.content_type)

@router.post("/admin/documents/{document_id}/reprocess")
def reprocess_document(
    document_id: int,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    document = db.query(Document).filter(Document.id == document_id, Document.is_cv.is_(False)).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    file_path = Path(document.file_path)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Stored file is unavailable")
    try:
        text_content = extract_document_text(file_path)
        chunks = chunk_text(text_content)
        embeddings = generate_embeddings(chunks)
        db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).delete()
        db.add_all([
            DocumentChunk(document_id=document.id, chunk_index=index, content=chunk, embedding=embedding)
            for index, (chunk, embedding) in enumerate(zip(chunks, embeddings))
        ])
        document.status = "Indexed"
        db.add(AuditEvent(actor=settings.ADMIN_USERNAME, action="reprocess_document", object_type="document", object_id=document.id, detail=document.filename))
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Document reprocessing failed")
        raise HTTPException(status_code=500, detail="Document reprocessing failed") from exc
    return {"document_id": document.id, "status": document.status, "chunks": len(chunks)}

@router.get("/admin/dashboard")
def admin_dashboard(
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    documents = db.query(Document).filter(Document.is_cv.is_(False)).all()
    total = len(documents)
    indexed = sum(document.status == "Indexed" for document in documents)
    return {
        "total_documents": total,
        "indexed_documents": indexed,
        "processing_documents": sum(document.status == "Processing" for document in documents),
        "failed_documents": sum(document.status == "Failed" for document in documents),
        "success_rate": round(indexed / total * 100, 1) if total else 0,
        "total_queries": db.query(KnowledgeQueryEvent).count(),
        "active_users": 1,
        "recent_uploads": [document_payload(document) for document in sorted(documents, key=lambda item: item.uploaded_at or 0, reverse=True)[:6]],
        "by_category": [
            {"category": category["name"], "count": sum(document.category == category["name"] for document in documents)}
            for category in CATEGORY_TREE
        ],
    }

@router.get("/admin/audit-logs")
def list_audit_events(
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    events = db.query(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(100).all()
    return {"events": [{
        "id": event.id,
        "actor": event.actor,
        "action": event.action,
        "object_type": event.object_type,
        "object_id": event.object_id,
        "detail": event.detail,
        "created_at": event.created_at,
    } for event in events]}

@router.get("/hr/candidates")
def list_candidates(
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    candidates = db.query(Document).filter(Document.is_cv.is_(True)).order_by(Document.uploaded_at.desc()).all()
    return {"candidates": [{
        **document_payload(document),
        "candidate_name": document.candidate_name,
        "target_role": document.candidate_role,
        "skills": [skill.strip() for skill in (document.candidate_skills or "").split(",") if skill.strip()],
        "experience_years": document.experience_years,
        "review_status": document.review_status or "Needs review",
    } for document in candidates]}

@router.post("/hr/candidates/search")
def search_candidates(
    request: CandidateSearchRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Document).filter(Document.is_cv.is_(True))
    if request.minimum_experience is not None:
        query = query.filter(Document.experience_years >= request.minimum_experience)
    if request.maximum_experience is not None:
        query = query.filter(Document.experience_years <= request.maximum_experience)
    if request.target_role:
        query = query.filter(Document.candidate_role.ilike(f"%{request.target_role}%"))
    if request.review_status != "All":
        query = query.filter(Document.review_status == request.review_status)

    matches = []
    for document in query.order_by(Document.uploaded_at.desc()).all():
        declared = [skill.strip() for skill in (document.candidate_skills or "").split(",") if skill.strip()]
        content = " ".join(chunk.content for chunk in db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).all())
        evidence = f"{document.candidate_name or ''} {document.candidate_role or ''} {' '.join(declared)} {content}".lower()
        found = [skill for skill in request.required_skills if skill.lower() in evidence]
        missing = [skill for skill in request.required_skills if skill.lower() not in evidence]
        if missing:
            continue
        if request.certifications and not all(cert.lower() in evidence for cert in request.certifications):
            continue
        excerpts = [content[max(0, content.lower().find(skill.lower()) - 100):content.lower().find(skill.lower()) + len(skill) + 180] for skill in request.required_skills if skill.lower() in content.lower()]
        matches.append({
            "candidate_id": document.id,
            "candidate_name": document.candidate_name or f"Candidate {document.id}",
            "target_role": document.candidate_role,
            "skills_found": sorted(set(found + [skill for skill in request.optional_skills if skill.lower() in evidence])),
            "missing_skills": missing,
            "experience_years": document.experience_years,
            "review_status": document.review_status or "Needs review",
            "cv_filename": document.filename,
            "evidence": excerpts[:4],
        })
    return {"matches": matches, "matching_mode": "exact skill matching"}

@router.patch("/hr/candidates/{candidate_id}")
def update_candidate_review(
    candidate_id: int,
    request: CandidateReviewRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    candidate = db.query(Document).filter(Document.id == candidate_id, Document.is_cv.is_(True)).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate.review_status = request.review_status
    db.add(AuditEvent(actor=settings.ADMIN_USERNAME, action="review_candidate", object_type="candidate", object_id=candidate.id, detail=request.review_status))
    db.commit()
    return {"candidate_id": candidate.id, "review_status": candidate.review_status}

@router.post("/{document_id}/search")
def search_document(
    document_id: int,
    request: SearchRequest,
    db: Session = Depends(get_db)
):

    # Make sure the document exists
    document = (
        db.query(Document)
        .filter(
            Document.id == document_id,
            Document.is_cv.is_(False),
            Document.access_group == "All employees",
            Document.confidentiality.in_(["Public", "Internal"]),
        )
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
        .join(Document, Document.id == DocumentChunk.document_id)
        .filter(
            Document.is_cv.is_(False),
            Document.access_group == "All employees",
            Document.confidentiality.in_(["Public", "Internal"]),
        )
        .filter(Document.category == request.category if request.category else True)
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
        .filter(
            Document.id == document_id,
            Document.is_cv.is_(False),
            Document.access_group == "All employees",
            Document.confidentiality.in_(["Public", "Internal"]),
        )
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
        .join(Document, Document.id == DocumentChunk.document_id)
        .filter(
            Document.is_cv.is_(False),
            Document.access_group == "All employees",
            Document.confidentiality.in_(["Public", "Internal"]),
        )
        .filter(Document.category == request.category if request.category else True)
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
    except RateLimitError as exc:
        logger.warning("Azure OpenAI rate limit reached")
        raise HTTPException(
            status_code=429,
            detail="The AI service is temporarily at capacity. Please retry in a moment."
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
        .filter(
            Document.is_cv.is_(False),
            Document.access_group == "All employees",
            Document.confidentiality.in_(["Public", "Internal"]),
        )
        .order_by(Document.uploaded_at.desc())
        .all()
    )

    return {
        "documents": [document_payload(document) for document in documents]
    }

@router.get("/{document_id}")
def get_document(
    document_id: int,
    db: Session = Depends(get_db)
):
    document = (
        db.query(Document)
        .filter(
            Document.id == document_id,
            Document.is_cv.is_(False),
            Document.access_group == "All employees",
            Document.confidentiality.in_(["Public", "Internal"]),
        )
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
    db.add(AuditEvent(
        actor=settings.ADMIN_USERNAME,
        action="delete_document",
        object_type="document",
        object_id=document.id,
        detail=document.filename,
    ))
    db.delete(document)
    db.commit()

    # Delete the actual PDF from disk
    if file_path.exists():
        file_path.unlink()

    return {
        "message": "Document deleted successfully",
        "document_id": document_id
    }