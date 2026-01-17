from typing import Literal
from fastapi.routing import APIRouter

docsRoute = APIRouter(prefix="/docs_splitting")


@docsRoute.get("/test")
def test_route() -> Literal['This is testing route for docs splitting section']:
    return "This is testing route for docs splitting section"