"""Leitura do portfolio da carteira: saldo de SOL + tokens SPL."""
from __future__ import annotations

from dataclasses import dataclass

from backend.app.solana_rpc import SolanaRpcClient

LAMPORTS_PER_SOL = 1_000_000_000


@dataclass
class TokenBalance:
    mint: str
    amount_ui: float
    decimals: int


@dataclass
class Portfolio:
    owner_pubkey: str
    sol_balance: float
    tokens: list[TokenBalance]


async def get_portfolio(rpc: SolanaRpcClient, owner_pubkey: str) -> Portfolio:
    lamports = await rpc.get_balance_lamports(owner_pubkey)
    accounts = await rpc.get_token_accounts(owner_pubkey)

    tokens: list[TokenBalance] = []
    for acc in accounts:
        try:
            info = acc["account"]["data"]["parsed"]["info"]
            token_amount = info["tokenAmount"]
            ui_amount = float(token_amount.get("uiAmount") or 0)
            if ui_amount <= 0:
                continue
            tokens.append(
                TokenBalance(
                    mint=info["mint"],
                    amount_ui=ui_amount,
                    decimals=int(token_amount["decimals"]),
                )
            )
        except (KeyError, TypeError):
            continue

    tokens.sort(key=lambda t: t.amount_ui, reverse=True)
    return Portfolio(
        owner_pubkey=owner_pubkey,
        sol_balance=lamports / LAMPORTS_PER_SOL,
        tokens=tokens,
    )
