from typing import Optional, List

from fastapi import APIRouter,  Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import asyncio

from .graph import arun_graph, get_chat_history, arun_graph_stream


router = APIRouter(tags=["document-qa"])


class QAResponse(BaseModel):
    answer: str
    thread_id: str  # This is the same as collection_id


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatHistoryResponse(BaseModel):
    messages: List[ChatMessage]
    collection_id: str
    filename: Optional[str] = None





@router.post("/ask", response_model=QAResponse)
async def ask_question(
    question: str = Form(...),
    collection_id: str = Form(...),
    provider: str = Form("gemini"),
    model: str = Form("gemini-2.0-flash"),
):
    """Ask a question on an existing collection. collection_id is used as thread_id."""
    # Run graph with collection_id as both retrieval collection and thread_id
    result = await arun_graph(question=question, collection_id=collection_id, provider=provider, model=model)

    return QAResponse(answer=result["answer"], thread_id=result["thread_id"])


@router.post("/ask-stream")
async def ask_question_stream(
    question: str = Form(...),
    collection_id: str = Form(...),
):
    """Stream the answer using SSE."""
    async def event_generator():
        try:
            # Send initial connection event
            yield f"data: {json.dumps({'type': 'start'})}\n\n"
            
            chunk_count = 0
            async for chunk in arun_graph_stream(question=question, collection_id=collection_id):
                chunk_count += 1
                # Send each chunk as SSE
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
                await asyncio.sleep(0.01)  # Small delay for better streaming
            
            print(f"Streamed {chunk_count} chunks")
            # Send completion event
            yield f"data: {json.dumps({'type': 'done', 'thread_id': collection_id})}\n\n"
        except Exception as e:
            print(f"Error in event_generator: {e}")
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/history/{collection_id}", response_model=ChatHistoryResponse)
async def get_history(collection_id: str):
    """Retrieve chat history for a given collection_id."""
    from pathlib import Path
    
    messages = await get_chat_history(collection_id)
    
    # Try to get filename from uploaded files
    filename = None
    uploaded_files_dir = Path(__file__).parent.parent / "uploaded_files" / collection_id
    if uploaded_files_dir.exists():
        files = list(uploaded_files_dir.glob("*"))
        if files:
            filename = files[0].name
    
    return ChatHistoryResponse(
        messages=[ChatMessage(**msg) for msg in messages],
        collection_id=collection_id,
        filename=filename
    )
