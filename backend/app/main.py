"""FastAPI da Puliana: expõe /health e /chat pro frontend consumir."""
from __future__ import annotations

from functools import lru_cache
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.app.config import ConfigError, get_settings
from backend.app.costs import record_usage
from backend.app.agent import PulianaAgent

app = FastAPI(title="Puliana")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache
def get_agent() -> PulianaAgent:
    return PulianaAgent(get_settings())


class ChatRequest(BaseModel):
    message: str
    history: list[dict[str, Any]] | None = None


class ChatResponse(BaseModel):
    reply: str
    messages: list[dict[str, Any]]


@app.get("/health")
def health() -> dict[str, str]:
    try:
        settings = get_settings()
    except ConfigError as exc:
        return {"status": "config_missing", "detail": str(exc)}
    return {"status": "ok", "agent_name": settings.agent_name}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    try:
        agent = get_agent()
    except ConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    result = await agent.chat(req.message, req.history)
    record_usage(result["usage"]["input_tokens"], result["usage"]["output_tokens"])
    return ChatResponse(reply=result["reply"], messages=_serialize_messages(result["messages"]))


def _serialize_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Converte blocos de conteúdo da SDK Anthropic (objetos) pra JSON simples,
    pra podermos devolver o histórico ao frontend e ele reenviar depois."""
    serialized = []
    for msg in messages:
        content = msg["content"]
        if isinstance(content, str):
            serialized.append(msg)
            continue
        blocks = []
        for block in content:
            if isinstance(block, dict):
                blocks.append(block)
            else:
                blocks.append(block.model_dump())
        serialized.append({"role": msg["role"], "content": blocks})
    return serialized
