from backend.app.confirmation import is_explicit_confirmation


def test_confirms_on_go():
    assert is_explicit_confirmation("go") is True
    assert is_explicit_confirmation("Go") is True


def test_confirms_on_manda():
    assert is_explicit_confirmation("manda ver") is True
    assert is_explicit_confirmation("Manda.") is True
    assert is_explicit_confirmation("confirmo") is True


def test_does_not_confirm_random_text():
    assert is_explicit_confirmation("quanto tenho de SOL?") is False
    assert is_explicit_confirmation("") is False
    assert is_explicit_confirmation("me manda os dados da pool") is False
    assert is_explicit_confirmation("confirmo, pode executar") is False
