"""Q&A sobre a metodologia Genesis (Portal 1 a 7 + Módulo 11).

O conteúdo real da metodologia vem do curso Defiverso (INSTALACAO.pdf /
material do aluno) e não está embutido neste kit por padrão. Coloque os
resumos/anotações de cada portal em arquivos markdown dentro de
`docs/methodology/` — este módulo só lê e concatena o que estiver lá pra
servir de contexto ao agente.
"""
from __future__ import annotations

from pathlib import Path

DOCS_DIR = Path(__file__).resolve().parents[3] / "docs" / "methodology"


def load_methodology_context() -> str:
    if not DOCS_DIR.exists():
        return ""

    parts: list[str] = []
    for md_file in sorted(DOCS_DIR.glob("*.md")):
        content = md_file.read_text(encoding="utf-8").strip()
        if content:
            parts.append(f"## {md_file.stem}\n\n{content}")

    return "\n\n".join(parts)
