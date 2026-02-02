from contextlib import asynccontextmanager

from fastapi import FastAPI
from .docs_splitting import docsRoute
from .docs_splitting.router import router as split_router
from .agent import router as agent_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown - graceful cleanup happens here


app = FastAPI(title="HnT Bot for Bidding Docs", lifespan=lifespan)

app.include_router(router=docsRoute)
app.include_router(router=split_router, prefix="/docs_splitting")
app.include_router(router=agent_router, prefix="/agent")
