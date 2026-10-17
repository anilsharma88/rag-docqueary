from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from sqlalchemy import text

from app.database import engine, Base
from app import models

from app.routers.documents import router as documents_router
from app.routers.knowledge import router as knowledge_router

with engine.begin() as connection:
    connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(bind=connection)
    for statement in (
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS title VARCHAR(255)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS category VARCHAR(120) NOT NULL DEFAULT 'Operations & Projects'",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS subcategory VARCHAR(120)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS department VARCHAR(120)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags TEXT",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS confidentiality VARCHAR(40) NOT NULL DEFAULT 'Internal'",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS access_group VARCHAR(120) NOT NULL DEFAULT 'All employees'",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'Indexed'",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_cv BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS candidate_name VARCHAR(200)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS candidate_role VARCHAR(200)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS candidate_skills TEXT",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS experience_years FLOAT",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS review_status VARCHAR(40)",
    ):
        connection.execute(text(statement))



app = FastAPI(
    title="DocuQuery API",
    description="AI-powered document question answering using RAG",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents_router)
app.include_router(knowledge_router)


@app.get("/")
def root():
    return {
        "message": "DocuQuery API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


@app.get("/db-test")
def test_database():

    with engine.connect() as connection:
        result = connection.execute(
            text("SELECT 1")
        )

        value = result.scalar()

    return {
        "database": "connected",
        "result": value
    }