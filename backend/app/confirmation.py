"""Trava de segurança: nenhuma transação sai sem confirmação explícita.

Qualquer tool que movimente fundos (swap, abrir/fechar posição) deve
primeiro devolver um "plano" pro usuário e só executar de fato quando a
mensagem seguinte for, ela mesma, uma confirmação — não basta *conter*
uma palavra-gatilho em qualquer lugar da frase (ex: "me manda os dados da
pool" não pode disparar uma transação só porque tem "manda" no meio).
Por isso a checagem exige que a mensagem inteira (normalizada) seja uma
das frases de confirmação abaixo.
"""
from __future__ import annotations

import string

_CONFIRM_PHRASES = {
    "go",
    "manda",
    "manda ver",
    "confirmo",
    "confirmado",
    "pode mandar",
    "sim, manda",
    "sim, confirmo",
    "pode confirmar",
}


def _normalize(message: str) -> str:
    return message.strip().lower().strip(string.punctuation + " ")


def is_explicit_confirmation(message: str) -> bool:
    """True só se a mensagem inteira for claramente uma confirmação de execução."""
    if not message:
        return False
    return _normalize(message) in _CONFIRM_PHRASES
