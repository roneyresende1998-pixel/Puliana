"""Cálculo de rebalanceamento pra abrir uma nova posição de pool."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RebalancePlan:
    token_a_symbol: str
    token_b_symbol: str
    target_usd: float
    token_a_amount_usd: float
    token_b_amount_usd: float
    swap_needed_usd: float
    swap_direction: str  # "a_para_b" | "b_para_a" | "nenhum"


def calculate_rebalance(
    token_a_symbol: str,
    token_b_symbol: str,
    current_a_usd: float,
    current_b_usd: float,
    target_total_usd: float,
    ratio_a: float = 0.5,
) -> RebalancePlan:
    """Calcula quanto precisa trocar de um token pro outro pra abrir uma
    posição balanceada de `target_total_usd`, na proporção `ratio_a` (padrão 50/50)."""
    ratio_a = min(max(ratio_a, 0.0), 1.0)
    target_a = round(target_total_usd * ratio_a, 2)
    target_b = round(target_total_usd - target_a, 2)

    delta_a = current_a_usd - target_a
    if abs(delta_a) < 0.01:
        direction = "nenhum"
        swap_usd = 0.0
    elif delta_a > 0:
        direction = "a_para_b"
        swap_usd = delta_a
    else:
        direction = "b_para_a"
        swap_usd = -delta_a

    return RebalancePlan(
        token_a_symbol=token_a_symbol,
        token_b_symbol=token_b_symbol,
        target_usd=target_total_usd,
        token_a_amount_usd=target_a,
        token_b_amount_usd=target_b,
        swap_needed_usd=round(swap_usd, 2),
        swap_direction=direction,
    )
