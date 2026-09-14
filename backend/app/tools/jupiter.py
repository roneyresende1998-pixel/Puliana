"""Swap via Jupiter (quote + execução assinada localmente).

A execução (`execute_swap`) só deve ser chamada depois que o usuário
confirmar explicitamente (ver `backend/app/confirmation.py`). Ela assina a
transação com o keypair local e envia pro RPC — dinheiro real sai daqui.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass

import httpx
from solders.keypair import Keypair
from solders.transaction import VersionedTransaction

from backend.app.solana_rpc import SolanaRpcClient

JUPITER_QUOTE_URL = "https://quote-api.jup.ag/v6/quote"
JUPITER_SWAP_URL = "https://quote-api.jup.ag/v6/swap"


@dataclass
class SwapQuote:
    input_mint: str
    output_mint: str
    in_amount: int
    out_amount: int
    price_impact_pct: float
    raw: dict


async def get_quote(
    input_mint: str,
    output_mint: str,
    amount_lamports: int,
    slippage_bps: int = 50,
) -> SwapQuote:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            JUPITER_QUOTE_URL,
            params={
                "inputMint": input_mint,
                "outputMint": output_mint,
                "amount": amount_lamports,
                "slippageBps": slippage_bps,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return SwapQuote(
        input_mint=input_mint,
        output_mint=output_mint,
        in_amount=int(data["inAmount"]),
        out_amount=int(data["outAmount"]),
        price_impact_pct=float(data.get("priceImpactPct") or 0) * 100,
        raw=data,
    )


async def execute_swap(rpc: SolanaRpcClient, keypair: Keypair, quote: SwapQuote) -> str:
    """Monta, assina e envia o swap. Só chame isso após confirmação explícita
    do usuário ("go"/"manda") — ver backend/app/confirmation.py."""
    user_pubkey = str(keypair.pubkey())

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            JUPITER_SWAP_URL,
            json={
                "quoteResponse": quote.raw,
                "userPublicKey": user_pubkey,
                "wrapAndUnwrapSol": True,
                "dynamicComputeUnitLimit": True,
                "prioritizationFeeLamports": "auto",
            },
        )
        resp.raise_for_status()
        swap_data = resp.json()

    tx_bytes = base64.b64decode(swap_data["swapTransaction"])
    tx = VersionedTransaction.from_bytes(tx_bytes)
    signed_tx = VersionedTransaction(tx.message, [keypair])
    signed_b64 = base64.b64encode(bytes(signed_tx)).decode()

    signature = await rpc.send_raw_transaction(signed_b64)
    return signature
