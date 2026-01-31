import os
import shutil
from pathlib import Path
from typing import Literal, Optional

from fastapi import UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse
from fastapi.routing import APIRouter

from app.rag.loaders import load_and_split
from app.rag.vectorstore import add_documents, generate_collection_id


docsRoute = APIRouter(prefix="/docs_splitting")

# Base directory for storing uploaded files
UPLOADED_FILES_DIR = Path(__file__).parent.parent / "uploaded_files"


def save_uploaded_file(file: UploadFile, collection_id: str) -> Path:
    """Save the uploaded file to a folder named with the collection ID."""
    # Create collection folder
    collection_folder = UPLOADED_FILES_DIR / collection_id
    collection_folder.mkdir(parents=True, exist_ok=True)
    
    # Save the file
    file_path = collection_folder / file.filename
    
    # Reset file position to beginning (in case it was read before)
    file.file.seek(0)
    
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    return file_path


@docsRoute.get("/test")
def test_route() -> Literal["This is testing route for docs splitting section"]:
    return "This is testing route for docs splitting section"

@docsRoute.post("/upload")
async def upload_and_embed(file: UploadFile = File(...)) -> dict:
    """Upload a PDF/DOCX, chunk it, and store embeddings in Chroma without Q&A."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="File is required.")

    # Generate a unique collection ID for this upload
    collection_id = generate_collection_id()

    # Load and split the document
    docs = await load_and_split(file)
    if not docs:
        raise HTTPException(status_code=400, detail="Could not extract text from document.")

    # Save the original file to the collection folder
    saved_path = save_uploaded_file(file, collection_id)

    # Add documents to the vectorstore with the collection ID
    add_documents(docs, collection_id=collection_id)

    return {
        "status": "ok",
        "collection_id": collection_id,
        "chunks_indexed": len(docs),
        "file_saved": str(saved_path.name)
    }

@docsRoute.post("/upload-only")
async def upload_only(
    file: UploadFile = File(...),
    collection_id: Optional[str] = Form(None),
) -> dict:
    """Upload a file and save it without processing/vectorization."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="File is required.")

    # Reuse provided collection ID if present, otherwise create a new one
    collection_id = collection_id or generate_collection_id()

    # Save the original file to the collection folder
    saved_path = save_uploaded_file(file, collection_id)

    return {
        "status": "ok",
        "collection_id": collection_id,
        "filename": file.filename,
        "file_saved": str(saved_path.name),
        "message": "File uploaded successfully. Use /process endpoint to vectorize."
    }


@docsRoute.get("/uploaded/{collection_id}/{filename}")
def download_uploaded_file(collection_id: str, filename: str):
    """Serve the original uploaded document."""
    collection_folder = UPLOADED_FILES_DIR / collection_id
    file_path = collection_folder / filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")

    return FileResponse(file_path, filename=filename)


@docsRoute.post("/process")
async def process_document(collection_id: str = Form(...)) -> dict:
    """Process and vectorize a previously uploaded document."""
    if not collection_id:
        raise HTTPException(status_code=400, detail="Collection ID is required.")
    
    # Check if collection folder exists
    collection_folder = UPLOADED_FILES_DIR / collection_id
    if not collection_folder.exists():
        raise HTTPException(status_code=404, detail=f"Collection {collection_id} not found.")
    
    # Find the uploaded file in the collection folder
    files = list(collection_folder.glob("*"))
    if not files:
        raise HTTPException(status_code=404, detail=f"No files found in collection {collection_id}.")
    
    file_path = files[0]  # Take the first (and should be only) file
    
    # Open the file and create an UploadFile object
    with open(file_path, "rb") as f:
        file_content = f.read()
    
    # Create a temporary UploadFile-like object
    from io import BytesIO
    
    # Load and split the document
    # We need to create a proper UploadFile object
    file_obj = BytesIO(file_content)
    upload_file = UploadFile(filename=file_path.name, file=file_obj)
    
    docs = await load_and_split(upload_file)
    if not docs:
        raise HTTPException(status_code=400, detail="Could not extract text from document.")
    
    # Add documents to the vectorstore with the collection ID
    add_documents(docs, collection_id=collection_id)
    
    return {
        "status": "ok",
        "collection_id": collection_id,
        "chunks_indexed": len(docs),
        "filename": file_path.name,
        "message": f"Document processed successfully. {len(docs)} chunks indexed."
    }