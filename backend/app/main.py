from fastapi import FastAPI
from .docs_splitting import docsRoute



app = FastAPI(title="HandT Bot for Bidding Docs")

app.include_router(router=docsRoute)
