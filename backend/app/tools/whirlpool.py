"""Posições de Whirlpool (Orca).

Leitura das posições abertas é feita via a API pública da Orca (dados,
sem assinatura). Abrir/fechar posição direto no Orca exige montar
instruções específicas do programa Whirlpool — isso normalmente é feito
com o SDK oficial (@orca-so/whirlpools-sdk, TypeScript/Rust). Não existe
hoje um SDK Python oficial maduro pra isso, então deixamos essas duas
funções como stub explícito em vez de arriscar montar instruções on-chain
"no chute" com dinheiro real.

Pra habilitar de verdade: plugue aqui uma chamada a um serviço/CLI que
use o SDK oficial da Orca (por ex. um microserviço Node que você chama
via subprocess ou HTTP), ou aguarde um binding Python oficial.
"""
from __future__ import annotations

from dataclasses import dataclass

import httpx

ORCA_POSITIONS_URL = "https://api.orca.so/v2/solana/positions"


@dataclass
class WhirlpoolPosition:
    position_id: str
    pool_id: str
    pair: str
    liquidity_usd: float
    in_range: bool


async def list_open_positions(owner_pubkey: str) -> list[WhirlpoolPosition]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(ORCA_POSITIONS_URL, params={"wallet": owner_pubkey})
        resp.raise_for_status()
        data = resp.json()

    items = data.get("data", data) if isinstance(data, dict) else data
    positions: list[WhirlpoolPosition] = []
    for item in items:
        try:
            positions.append(
                WhirlpoolPosition(
                    position_id=item.get("address") or item.get("positionId", ""),
                    pool_id=item.get("whirlpoolAddress") or item.get("poolId", ""),
                    pair=item.get("pair") or item.get("name", "?/?"),
                    liquidity_usd=float(item.get("liquidityUsd") or item.get("valueUsd") or 0),
                    in_range=bool(item.get("inRange", True)),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return positions


async def open_position(*args, **kwargs) -> str:
    raise NotImplementedError(
        "Abrir posição de Whirlpool ainda não está implementado neste kit — "
        "requer o SDK oficial da Orca. Veja o comentário no topo deste arquivo."
    )


async def close_position(*args, **kwargs) -> str:
    raise NotImplementedError(
        "Fechar posição de Whirlpool ainda não está implementado neste kit — "
        "requer o SDK oficial da Orca. Veja o comentário no topo deste arquivo."
    )
