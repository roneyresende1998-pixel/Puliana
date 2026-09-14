"""Loop do agente: Claude + tools da Puliana, com trava de confirmação
antes de qualquer transação on-chain."""
from __future__ import annotations

import json
from typing import Any

import httpx
from anthropic import Anthropic

from backend.app.config import Settings
from backend.app.confirmation import is_explicit_confirmation
from backend.app.keypair import load_keypair
from backend.app.solana_rpc import SolanaRpcClient
from backend.app.tools import jupiter, methodology, pools, rebalance, wallet, whirlpool

SYSTEM_PROMPT_TEMPLATE = """\
Você é {agent_name}, uma assistente de IA especialista em pools de liquidez \
na Solana, treinada com a metodologia Genesis (Portal 1 a 7 + Módulo 11).

Regras inegociáveis:
- Fale sempre em português brasileiro, tom direto, sem enrolação.
- O ciclo de mercado atual definido pelo usuário é: {market_cycle}.
- NUNCA execute swap, abertura ou fechamento de posição sem antes mostrar
  um plano claro (valores, tokens, taxas estimadas) e esperar o usuário
  confirmar explicitamente com "go" ou "manda". Se ele não confirmar,
  não execute — só planeje.
- Você opera em MAINNET: toda transação é dinheiro real.
- Ao chamar uma tool que executa (swap_execute), só faça isso se o
  parâmetro `user_confirmed` vier true — ele reflete se a ÚLTIMA mensagem
  do usuário continha uma confirmação explícita.
"""

TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_portfolio",
        "description": "Mostra o saldo de SOL e tokens SPL da carteira do usuário.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "scan_pools",
        "description": "Escaneia pools de liquidez na Orca e Raydium e retorna as melhores ranqueadas pela metodologia Genesis.",
        "input_schema": {
            "type": "object",
            "properties": {"top_n": {"type": "integer", "description": "Quantas pools retornar (padrão 10)"}},
        },
    },
    {
        "name": "list_whirlpool_positions",
        "description": "Lista as posições de Whirlpool (Orca) abertas do usuário.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "calculate_rebalance",
        "description": "Calcula quanto trocar de um token pro outro pra abrir uma posição balanceada.",
        "input_schema": {
            "type": "object",
            "properties": {
                "token_a_symbol": {"type": "string"},
                "token_b_symbol": {"type": "string"},
                "current_a_usd": {"type": "number"},
                "current_b_usd": {"type": "number"},
                "target_total_usd": {"type": "number"},
                "ratio_a": {"type": "number", "description": "Proporção do token A, 0 a 1 (padrão 0.5)"},
            },
            "required": ["token_a_symbol", "token_b_symbol", "current_a_usd", "current_b_usd", "target_total_usd"],
        },
    },
    {
        "name": "get_swap_quote",
        "description": "Pega uma cotação de swap via Jupiter (não executa nada, só mostra o plano).",
        "input_schema": {
            "type": "object",
            "properties": {
                "input_mint": {"type": "string"},
                "output_mint": {"type": "string"},
                "amount_lamports": {"type": "integer"},
            },
            "required": ["input_mint", "output_mint", "amount_lamports"],
        },
    },
    {
        "name": "swap_execute",
        "description": "Executa de fato um swap via Jupiter. SÓ chame com user_confirmed=true, e só depois de já ter mostrado a cotação com get_swap_quote nesta mesma conversa.",
        "input_schema": {
            "type": "object",
            "properties": {
                "input_mint": {"type": "string"},
                "output_mint": {"type": "string"},
                "amount_lamports": {"type": "integer"},
                "user_confirmed": {"type": "boolean"},
            },
            "required": ["input_mint", "output_mint", "amount_lamports", "user_confirmed"],
        },
    },
]


class PulianaAgent:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.anthropic = Anthropic(api_key=settings.anthropic_api_key)
        self.keypair = load_keypair(settings.solana_private_key)
        self.pubkey = str(self.keypair.pubkey())

    def _system_prompt(self) -> str:
        base = SYSTEM_PROMPT_TEMPLATE.format(
            agent_name=self.settings.agent_name, market_cycle=self.settings.market_cycle
        )
        methodology_ctx = methodology.load_methodology_context()
        if methodology_ctx:
            base += f"\n\nContexto da metodologia Genesis:\n\n{methodology_ctx}"
        return base

    async def _run_tool(self, name: str, tool_input: dict[str, Any], last_user_message: str) -> Any:
        rpc = SolanaRpcClient(self.settings.solana_rpc_url)
        try:
            if name == "get_portfolio":
                portfolio = await wallet.get_portfolio(rpc, self.pubkey)
                return {
                    "sol_balance": portfolio.sol_balance,
                    "tokens": [
                        {"mint": t.mint, "amount": t.amount_ui} for t in portfolio.tokens
                    ],
                }

            if name == "scan_pools":
                top_n = int(tool_input.get("top_n", 10))
                ranked = await pools.scan_and_rank_pools(top_n=top_n)
                return [
                    {
                        "source": p.source,
                        "pair": p.pair,
                        "pool_id": p.pool_id,
                        "tvl_usd": p.tvl_usd,
                        "volume_24h_usd": p.volume_24h_usd,
                        "apr_24h": p.apr_24h,
                        "genesis_score": p.genesis_score,
                    }
                    for p in ranked
                ]

            if name == "list_whirlpool_positions":
                positions = await whirlpool.list_open_positions(self.pubkey)
                return [
                    {
                        "position_id": p.position_id,
                        "pair": p.pair,
                        "liquidity_usd": p.liquidity_usd,
                        "in_range": p.in_range,
                    }
                    for p in positions
                ]

            if name == "calculate_rebalance":
                plan = rebalance.calculate_rebalance(
                    token_a_symbol=tool_input["token_a_symbol"],
                    token_b_symbol=tool_input["token_b_symbol"],
                    current_a_usd=tool_input["current_a_usd"],
                    current_b_usd=tool_input["current_b_usd"],
                    target_total_usd=tool_input["target_total_usd"],
                    ratio_a=tool_input.get("ratio_a", 0.5),
                )
                return plan.__dict__

            if name == "get_swap_quote":
                quote = await jupiter.get_quote(
                    tool_input["input_mint"], tool_input["output_mint"], tool_input["amount_lamports"]
                )
                return {
                    "in_amount": quote.in_amount,
                    "out_amount": quote.out_amount,
                    "price_impact_pct": quote.price_impact_pct,
                }

            if name == "swap_execute":
                confirmed = bool(tool_input.get("user_confirmed")) and is_explicit_confirmation(
                    last_user_message
                )
                if not confirmed:
                    return {
                        "executed": False,
                        "reason": "Sem confirmação explícita do usuário (\"go\"/\"manda\"). Nada foi enviado.",
                    }
                quote = await jupiter.get_quote(
                    tool_input["input_mint"], tool_input["output_mint"], tool_input["amount_lamports"]
                )
                signature = await jupiter.execute_swap(rpc, self.keypair, quote)
                return {"executed": True, "signature": signature}

            return {"error": f"Tool desconhecida: {name}"}
        finally:
            await rpc.aclose()

    async def chat(self, user_message: str, history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        messages = list(history or [])
        messages.append({"role": "user", "content": user_message})

        total_input_tokens = 0
        total_output_tokens = 0

        for _ in range(6):  # limite de idas e vindas de tool-use por turno
            response = self.anthropic.messages.create(
                model=self.settings.agent_model,
                max_tokens=2048,
                system=self._system_prompt(),
                tools=TOOLS,
                messages=messages,
            )
            total_input_tokens += response.usage.input_tokens
            total_output_tokens += response.usage.output_tokens

            if response.stop_reason != "tool_use":
                text = "".join(
                    block.text for block in response.content if block.type == "text"
                )
                messages.append({"role": "assistant", "content": response.content})
                return {
                    "reply": text,
                    "messages": messages,
                    "usage": {"input_tokens": total_input_tokens, "output_tokens": total_output_tokens},
                }

            messages.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                result = await self._run_tool(block.name, block.input, user_message)
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result, ensure_ascii=False, default=str),
                    }
                )
            messages.append({"role": "user", "content": tool_results})

        return {
            "reply": "Desculpa, essa conversa ficou complexa demais pra eu resolver num turno só. Tenta de novo com um pedido mais direto.",
            "messages": messages,
            "usage": {"input_tokens": total_input_tokens, "output_tokens": total_output_tokens},
        }
