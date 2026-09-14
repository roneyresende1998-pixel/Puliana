from backend.app.tools.pools import score_pool


def test_score_pool_below_tvl_floor_is_zero():
    assert score_pool(tvl_usd=5_000, volume_24h_usd=50_000, apr_24h=80) == 0.0


def test_score_pool_rewards_efficiency_and_apr():
    low = score_pool(tvl_usd=100_000, volume_24h_usd=10_000, apr_24h=5)
    high = score_pool(tvl_usd=100_000, volume_24h_usd=200_000, apr_24h=60)
    assert high > low
