"""Carrega o keypair Solana a partir de SOLANA_PRIVATE_KEY (.env).

Aceita dois formatos, iguais aos usados por Phantom / solana-keygen:
  - base58 (string única, o formato que o Phantom exporta)
  - array JSON de 64 bytes, ex: "[12,34,...]" (formato solana-keygen)
"""
from __future__ import annotations

import json

import base58
from solders.keypair import Keypair


class KeypairError(ValueError):
    pass


def load_keypair(raw_private_key: str) -> Keypair:
    raw = raw_private_key.strip()
    if not raw:
        raise KeypairError("SOLANA_PRIVATE_KEY está vazio.")

    if raw.startswith("["):
        try:
            byte_list = json.loads(raw)
            return Keypair.from_bytes(bytes(byte_list))
        except Exception as exc:  # noqa: BLE001
            raise KeypairError(f"Não consegui ler SOLANA_PRIVATE_KEY como array JSON: {exc}") from exc

    try:
        decoded = base58.b58decode(raw)
        return Keypair.from_bytes(decoded)
    except Exception as exc:  # noqa: BLE001
        raise KeypairError(
            "Não consegui ler SOLANA_PRIVATE_KEY. Use base58 (Phantom) "
            "ou array JSON de bytes (solana-keygen)."
        ) from exc
