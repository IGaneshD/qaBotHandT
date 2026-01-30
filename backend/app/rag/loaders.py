import os
import tempfile
from typing import List

from dotenv import load_dotenv
from fastapi import UploadFile, HTTPException
# from langchain_community.document_loaders import (
#     UnstructuredPDFLoader,
#     UnstructuredWordDocumentLoader,
# )

from langchain_community.document_loaders import PDFPlumberLoader, Docx2txtLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document


load_dotenv()


text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=4000,
    chunk_overlap=200,
)


def _loader_for_path(path: str):
    """Return a loader that better preserves structure such as tables."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        # PDFPlumberLoader for better table and layout preservation
        return PDFPlumberLoader(path)
    if ext in (".docx", ".doc"):
        # Docx2txtLoader for Word documents
        return Docx2txtLoader(path)
    raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF or DOCX.")


async def load_and_split(file: UploadFile) -> List[Document]:
    suffix = os.path.splitext(file.filename or "")[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        loader = _loader_for_path(tmp_path)
        docs = loader.load()
        return text_splitter.split_documents(docs)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
