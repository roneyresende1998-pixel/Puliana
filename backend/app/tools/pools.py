"""Scan de pools de liquidez (Orca, Raydium) + ranking pela metodologia Genesis.

Os endpoints públicos das APIs da Orca/Raydium mudam de vez em quando.
Os usados aqui são os mais estáveis conhecidos no momento da escrita deste
kit — se algum deixar de responder, ajuste a URL em `ORCA_POOLS_URL` /
`RAYDIUM_POOLS_URL` (não precisa mexer no resto do código).

O critério de ranking abaixo é um placeholder razoável (TVL, relação
volume/TVL como proxy de eficiência de taxas, e APR) até você colar os
critérios exatos do Portal 1-7 / Módulo 11 do curso em `score_pool()`.
"""
from __future__ import annotations

from dataclasses import dataclass

import httpx

ORCA_POOLS_URL = "https://api.orca.so/v2/solana/pools"
RAYDIUM_POOLS_URL = "https://api-v3.raydium.io/pools/info/list"


@dataclass
class PoolInfo:
    source: str  # "orca" | "raydium"
    pool_id: str
    pair: str
    tvl_usd: float
    volume_24h_usd: float
    apr_24h: float
    genesis_score: float = 0.0


def score_pool(tvl_usd: float, volume_24h_usd: float, apr_24h: float) -> float:
    """Placeholder da metodologia Genesis — ajuste com os critérios reais do curso.

    Hoje pondera: eficiência de taxas (volume/TVL), APR e um piso mínimo de
    TVL pra evitar pools ilíquidas/armadilhadas.
    """
    if tvl_usd < 10_000:
        return 0.0
    efficiency = volume_24h_usd / tvl_usd if tvl_usd else 0.0
    return round(efficiency * 0.5 + (apr_24h / 100) * 0.5, 4)


async def fetch_orca_pools(client: httpx.AsyncClient, limit: int = 50) -> list[PoolInfo]:
    resp = await client.get(ORCA_POOLS_URL, params={"limit": limit, "sortBy": "tvl"})
    resp.raise_for_status()
    data = resp.json()
    items = data.get("data", data) if isinstance(data, dict) else data

    pools: list[PoolInfo] = []
    for item in items[:limit]:
        try:
            tvl = float(item.get("tvlUsdc") or item.get("tvl") or 0)
            vol = float(item.get("volume", {}).get("day", 0) if isinstance(item.get("volume"), dict) else item.get("volume24h", 0) or 0)
            apr = float(item.get("apr", {}).get("day", 0) if isinstance(item.get("apr"), dict) else item.get("apr24h", 0) or 0)
            pair = item.get("name") or f"{item.get('tokenA', {}).get('symbol', '?')}/{item.get('tokenB', {}).get('symbol', '?')}"
            pools.append(
                PoolInfo(
                    source="orca",
                    pool_id=item.get("address") or item.get("poolId") or "",
                    pair=pair,
                    tvl_usd=tvl,
                    volume_24h_usd=vol,
                    apr_24h=apr,
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return pools


async def fetch_raydium_pools(client: httpx.AsyncClient, limit: int = 50) -> list[PoolInfo]:
    resp = await client.get(
        RAYDIUM_POOLS_URL,
        params={"poolType": "all", "poolSortField": "liquidity", "sortType": "desc", "pageSize": limit, "page": 1},
    )
    resp.raise_for_status()
    data = resp.json()
    items = data.get("data", {}).get("data", []) if isinstance(data, dict) else data

    pools: list[PoolInfo] = []
    for item in items[:limit]:
        try:
            pools.append(
                PoolInfo(
                    source="raydium",
                    pool_id=item.get("id", ""),
                    pair=f"{item.get('mintA', {}).get('symbol', '?')}/{item.get('mintB', {}).get('symbol', '?')}",
                    tvl_usd=float(item.get("tvl") or 0),
                    volume_24h_usd=float(item.get("day", {}).get("volume", 0) or 0),
                    apr_24h=float(item.get("day", {}).get("apr", 0) or 0),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return pools


async def scan_and_rank_pools(limit_per_source: int = 30, top_n: int = 10) -> list[PoolInfo]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        orca_pools: list[PoolInfo] = []
        raydium_pools: list[PoolInfo] = []
        try:
            orca_pools = await fetch_orca_pools(client, limit_per_source)
        except httpx.HTTPError:
            pass
        try:
            raydium_pools = await fetch_raydium_pools(client, limit_per_source)
        except httpx.HTTPError:
            pass

    all_pools = orca_pools + raydium_pools
    for pool in all_pools:
        pool.genesis_score = score_pool(pool.tvl_usd, pool.volume_24h_usd, pool.apr_24h)

    all_pools.sort(key=lambda p: p.genesis_score, reverse=True)
    return all_pools[:top_n]
