from backend.app.tools.rebalance import calculate_rebalance


def test_rebalance_needs_swap_a_to_b():
    plan = calculate_rebalance("SOL", "USDC", current_a_usd=800, current_b_usd=200, target_total_usd=1000)
    assert plan.swap_direction == "a_para_b"
    assert plan.swap_needed_usd == 300.0


def test_rebalance_already_balanced():
    plan = calculate_rebalance("SOL", "USDC", current_a_usd=500, current_b_usd=500, target_total_usd=1000)
    assert plan.swap_direction == "nenhum"
    assert plan.swap_needed_usd == 0.0


def test_rebalance_custom_ratio():
    plan = calculate_rebalance(
        "SOL", "USDC", current_a_usd=0, current_b_usd=1000, target_total_usd=1000, ratio_a=0.7
    )
    assert plan.token_a_amount_usd == 700.0
    assert plan.token_b_amount_usd == 300.0
