from context.guardian import select_notes


def test_select_notes_respects_budget_and_session_dedupe():
    notes = [
        {"id": "a", "score": 0.99, "token_cost": 400},
        {"id": "b", "score": 0.95, "token_cost": 800},
        {"id": "c", "score": 0.5, "token_cost": 200},
    ]

    kept = select_notes(notes, already_injected={"a"})

    assert [note["id"] for note in kept] == ["b"]
