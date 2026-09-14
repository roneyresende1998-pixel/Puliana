"""Rastreio simples de custo de API (tokens Anthropic) por dia."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from threading import Lock

# Preços aproximados por milhão de tokens (ajuste se seu modelo/contrato mudar).
PRICE_PER_MILLION_INPUT_USD = 3.0
PRICE_PER_MILLION_OUTPUT_USD = 15.0

LOG_DIR = Path(__file__).resolve().parents[2] / "config"
LOG_PATH = LOG_DIR / "usage.jsonl"
_lock = Lock()


def record_usage(input_tokens: int, output_tokens: int) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    entry = {
        "date": date.today().isoformat(),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    }
    with _lock, LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def cost_today_usd() -> tuple[float, int, int]:
    if not LOG_PATH.exists():
        return 0.0, 0, 0

    today = date.today().isoformat()
    total_in = total_out = 0
    with LOG_PATH.open(encoding="utf-8") as f:
        for line in f:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("date") == today:
                total_in += int(entry.get("input_tokens", 0))
                total_out += int(entry.get("output_tokens", 0))

    cost = (total_in / 1_000_000) * PRICE_PER_MILLION_INPUT_USD + (
        total_out / 1_000_000
    ) * PRICE_PER_MILLION_OUTPUT_USD
    return round(cost, 4), total_in, total_out
