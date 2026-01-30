import os
import shutil
import zipfile
from pathlib import Path
from typing import List, Dict

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from .pdf_splitter import PDFSplitter

router = APIRouter(prefix="/split", tags=["PDF Splitting"])

# Base directory for storing uploaded files and split outputs
SPLIT_FILES_DIR = Path(__file__).parent.parent / "split_files"
SPLIT_FILES_DIR.mkdir(parents=True, exist_ok=True)


class SectionInfo(BaseModel):
    """Information about a detected section."""
    title: str
    page: int


class OutputFileInfo(BaseModel):
    """Information about a split output file."""
    title: str
    filename: str
    start_page: int
    end_page: int
    path: str


class SplitResponse(BaseModel):
    """Response model for PDF split operation."""
    status: str
    upload_id: str
    sections: List[SectionInfo]
    output_files: List[OutputFileInfo]
    total_sections: int
    output_directory: str


@router.post("/pdf", response_model=SplitResponse)
async def split_pdf_by_toc(
    file: UploadFile = File(...),
    model_name: str = "gemini-2.5-flash",
    max_toc_pages: int = 20
) -> SplitResponse:
    """
    Split a PDF document into sections based on its Table of Contents.
    
    Uses AI to parse the TOC and intelligently split the document into main sections
    (Chapters, Annexures, Appendices).
    
    Parameters:
    - file: The PDF file to split
    - model_name: The LLM model to use for TOC parsing (default: gemini-2.5-flash)
    - max_toc_pages: Maximum number of pages to scan for TOC (default: 20)
    
    Returns:
    - Information about detected sections and split output files
    """
    if not file.filename or not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    # Create temporary directory for this upload
    import uuid
    upload_id = str(uuid.uuid4())
    upload_dir = SPLIT_FILES_DIR / upload_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    # Save uploaded file
    input_path = upload_dir / file.filename
    try:
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        shutil.rmtree(upload_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
    
    # Create output directory for split files
    output_dir = upload_dir / "split_output"
    
    # Split the PDF
    try:
        splitter = PDFSplitter(model_name=model_name, max_toc_pages=max_toc_pages)
        result = splitter.split_pdf(str(input_path), str(output_dir))
        
        return SplitResponse(
            upload_id=upload_id,
            status="success",
            sections=[SectionInfo(**s) for s in result["sections"]],
            output_files=[OutputFileInfo(**f) for f in result["output_files"]],
            total_sections=result["total_sections"],
            output_directory=str(output_dir)
        )
    except RuntimeError as e:
        shutil.rmtree(upload_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        shutil.rmtree(upload_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to split PDF: {str(e)}")


@router.get("/download/{upload_id}/{filename}")
async def download_single_file(upload_id: str, filename: str):
    """
    Download a single split PDF file.
    
    Parameters:
    - upload_id: The unique upload ID returned from the split operation
    - filename: The name of the file to download
    """
    file_path = SPLIT_FILES_DIR / upload_id / "split_output" / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/pdf"
    )


@router.get("/download-all/{upload_id}")
async def download_all_files(upload_id: str):
    """
    Download all split PDF files as a ZIP archive.
    
    Parameters:
    - upload_id: The unique upload ID returned from the split operation
    """
    output_dir = SPLIT_FILES_DIR / upload_id / "split_output"
    
    if not output_dir.exists():
        raise HTTPException(status_code=404, detail="Split files not found")
    
    # Create a ZIP file in memory
    zip_path = SPLIT_FILES_DIR / upload_id / "split_files.zip"
    
    try:
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for pdf_file in output_dir.glob("*.pdf"):
                zipf.write(pdf_file, arcname=pdf_file.name)
        
        return FileResponse(
            path=str(zip_path),
            filename=f"split_files_{upload_id}.zip",
            media_type="application/zip"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create ZIP file: {str(e)}")


@router.get("/files/{upload_id}")
async def list_split_files(upload_id: str):
    """
    List all split PDF files for a given upload ID.
    
    Parameters:
    - upload_id: The unique upload ID returned from the split operation
    """
    output_dir = SPLIT_FILES_DIR / upload_id / "split_output"
    
    if not output_dir.exists():
        raise HTTPException(status_code=404, detail="Split files not found")
    
    files = []
    for pdf_file in output_dir.glob("*.pdf"):
        files.append({
            "filename": pdf_file.name,
            "size": pdf_file.stat().st_size,
            "download_url": f"/docs_splitting/split/download/{upload_id}/{pdf_file.name}"
        })
    
    return {
        "upload_id": upload_id,
        "total_files": len(files),
        "files": files,
        "download_all_url": f"/docs_splitting/split/download-all/{upload_id}"
    }


@router.delete("/files/{upload_id}")
async def delete_split_files(upload_id: str):
    """
    Delete all files associated with an upload ID.
    
    Parameters:
    - upload_id: The unique upload ID to delete
    """
    upload_dir = SPLIT_FILES_DIR / upload_id
    
    if not upload_dir.exists():
        raise HTTPException(status_code=404, detail="Upload ID not found")
    
    try:
        shutil.rmtree(upload_dir)
        return {"status": "success", "message": f"Deleted all files for upload ID: {upload_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete files: {str(e)}")


@router.get("/test")
def test_split_api():
    """Test endpoint for PDF splitting API."""
    return {
        "status": "ok",
        "message": "PDF Splitting API is running",
        "supported_models": ["gemini-2.5-flash", "gemini-1.5-pro"]
    }
