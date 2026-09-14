import pytest

from backend.app.solana_rpc import SolanaRpcClient
from backend.app.tools.wallet import get_portfolio


class FakeRpc(SolanaRpcClient):
    def __init__(self):
        pass

    async def get_balance_lamports(self, pubkey: str) -> int:
        return 2_500_000_000  # 2.5 SOL

    async def get_token_accounts(self, owner_pubkey: str):
        return [
            {
                "account": {
                    "data": {
                        "parsed": {
                            "info": {
                                "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                                "tokenAmount": {"uiAmount": 123.45, "decimals": 6},
                            }
                        }
                    }
                }
            },
            {
                "account": {
                    "data": {
                        "parsed": {
                            "info": {
                                "mint": "dust-token",
                                "tokenAmount": {"uiAmount": 0, "decimals": 6},
                            }
                        }
                    }
                }
            },
        ]


@pytest.mark.asyncio
async def test_get_portfolio_parses_balances():
    portfolio = await get_portfolio(FakeRpc(), "SomeOwnerPubkey")
    assert portfolio.sol_balance == 2.5
    assert len(portfolio.tokens) == 1
    assert portfolio.tokens[0].amount_ui == 123.45
