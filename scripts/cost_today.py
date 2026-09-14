#!/usr/bin/env python3
"""`make cost-today` — mostra quanto foi gasto em API da Anthropic hoje."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.costs import cost_today_usd  # noqa: E402

if __name__ == "__main__":
    cost, input_tokens, output_tokens = cost_today_usd()
    print(f"Gasto hoje (estimado): US$ {cost:.4f}")
    print(f"  tokens de entrada:  {input_tokens:,}")
    print(f"  tokens de saída:    {output_tokens:,}")
