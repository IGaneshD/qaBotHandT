import uuid
from typing import List, Optional

from dotenv import load_dotenv
# from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings

load_dotenv()


EMBEDDING_MODEL = r"sentence-transformers/all-MiniLM-L6-v2"
PERSIST_DIR = "./chroma_db"



# _embeddings = GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL)
_embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)


def _get_vectorstore(collection_name: str) -> Chroma:
    """Get or create a Chroma vectorstore for a specific collection."""
    return Chroma(
        collection_name=collection_name,
        embedding_function=_embeddings,
        persist_directory=PERSIST_DIR,
    )


def generate_collection_id() -> str:
    """Generate a unique collection ID."""
    return str(uuid.uuid4())


def add_documents(docs: List[Document], collection_id: Optional[str] = None) -> str:
    """Add documents to a collection. Returns the collection ID."""
    if collection_id is None:
        collection_id = generate_collection_id()
    
    vectorstore = _get_vectorstore(collection_id)
    vectorstore.add_documents(docs)
    return collection_id


def get_retriever(collection_id: Optional[str] = None):
    """Get a retriever for a specific collection or the default one."""
    collection_name = collection_id 
    vectorstore = _get_vectorstore(collection_name)
    return vectorstore.as_retriever(k=10)
