"""Carrega config/.env e expõe as configurações da Puliana."""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import dotenv_values

ROOT_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT_DIR / "config" / ".env"


@dataclass(frozen=True)
class Settings:
    agent_name: str
    anthropic_api_key: str
    agent_model: str
    voice_enabled: bool
    elevenlabs_api_key: str | None
    elevenlabs_voice_id: str | None
    solana_private_key: str
    solana_rpc_url: str
    market_cycle: str
    backend_port: int
    frontend_port: int


class ConfigError(RuntimeError):
    pass


@lru_cache
def get_settings() -> Settings:
    if not ENV_PATH.exists():
        raise ConfigError(
            f"{ENV_PATH} não existe. Rode ./setup.sh na raiz do projeto primeiro."
        )
    values = dotenv_values(ENV_PATH)

    def required(key: str) -> str:
        val = (values.get(key) or "").strip()
        if not val:
            raise ConfigError(f"'{key}' não está definido em config/.env")
        return val

    voice_enabled = (values.get("VOICE_ENABLED") or "false").strip().lower() == "true"
    if voice_enabled and not (values.get("ELEVENLABS_API_KEY") or "").strip():
        raise ConfigError("VOICE_ENABLED=true mas ELEVENLABS_API_KEY está vazio.")

    return Settings(
        agent_name=(values.get("AGENT_NAME") or "Puliana").strip(),
        anthropic_api_key=required("ANTHROPIC_API_KEY"),
        agent_model=(values.get("AGENT_MODEL") or "claude-sonnet-5").strip(),
        voice_enabled=voice_enabled,
        elevenlabs_api_key=(values.get("ELEVENLABS_API_KEY") or "").strip() or None,
        elevenlabs_voice_id=(values.get("ELEVENLABS_VOICE_ID") or "").strip() or None,
        solana_private_key=required("SOLANA_PRIVATE_KEY"),
        solana_rpc_url=(values.get("SOLANA_RPC_URL") or "https://api.mainnet-beta.solana.com").strip(),
        market_cycle=(values.get("MARKET_CYCLE") or "neutro").strip().lower(),
        backend_port=int(values.get("BACKEND_PORT") or 8000),
        frontend_port=int(values.get("FRONTEND_PORT") or 5173),
    )
