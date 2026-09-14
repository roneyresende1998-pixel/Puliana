"""Cliente fino para o JSON-RPC da Solana (leitura de dados on-chain)."""
from __future__ import annotations

from typing import Any

import httpx

TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"


class SolanaRpcError(RuntimeError):
    pass


class SolanaRpcClient:
    def __init__(self, rpc_url: str, timeout: float = 20.0):
        self.rpc_url = rpc_url
        self._client = httpx.AsyncClient(timeout=timeout)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _call(self, method: str, params: list[Any]) -> Any:
        payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        resp = await self._client.post(self.rpc_url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise SolanaRpcError(f"{method} falhou: {data['error']}")
        return data["result"]

    async def get_balance_lamports(self, pubkey: str) -> int:
        result = await self._call("getBalance", [pubkey])
        return int(result["value"])

    async def get_token_accounts(self, owner_pubkey: str) -> list[dict[str, Any]]:
        result = await self._call(
            "getTokenAccountsByOwner",
            [
                owner_pubkey,
                {"programId": TOKEN_PROGRAM_ID},
                {"encoding": "jsonParsed"},
            ],
        )
        return result.get("value", [])

    async def get_latest_blockhash(self) -> str:
        result = await self._call("getLatestBlockhash", [{"commitment": "confirmed"}])
        return result["value"]["blockhash"]

    async def send_raw_transaction(self, signed_tx_b64: str) -> str:
        """Envia uma transação assinada (base64). Retorna a signature."""
        result = await self._call(
            "sendTransaction",
            [signed_tx_b64, {"encoding": "base64", "preflightCommitment": "confirmed", "maxRetries": 3}],
        )
        return result
