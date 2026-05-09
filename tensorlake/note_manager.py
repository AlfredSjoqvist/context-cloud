"""Tensorlake-deployed Note Manager.

Wraps `nm_extract.extract_session` so it runs in a Tensorlake sandbox,
triggered by a webhook fired from Claude Code's Stop / SubagentStop hook.

Local CLI is unchanged: `python nm_extract.py --session <id>` still works.
This file only adds the Tensorlake function envelope.

Trigger contract (POST):
    {
        "session_id": "<claude code session uuid>",
        "use_llm":    true,                  # optional; default true
        "dry_run":    false                  # optional; default false
    }

Returns the same dict shape `extract_session` returns. The function also
mirrors notes / hurdles to Convex via the same nm_convex hooks the local
pipeline uses — set CONVEX_URL + NM_SYNC_TOKEN in the Tensorlake function's
secrets.

Deploy:
    pip install tensorlake
    export TENSORLAKE_API_KEY=<your key>
    tensorlake deploy tensorlake/note_manager.py --name nm-note-manager
    # then point your Claude Code Stop hook at the function's webhook URL.

If you don't have Tensorlake credentials yet, this file still imports cleanly
and the underlying `extract_session` is fully runnable as a CLI.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

# Make the project root importable when this file runs as a Tensorlake fn.
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from nm_extract import extract_session  # noqa: E402

# Tensorlake decorator import is wrapped so this file works even when the SDK
# isn't installed locally (the user only needs it on the deploy machine).
try:
    from tensorlake.functions_sdk.functions import tensorlake_function  # type: ignore
except Exception:  # pragma: no cover
    def tensorlake_function(*_args, **_kwargs):  # type: ignore
        def deco(fn):
            return fn
        return deco


@tensorlake_function(name="nm-note-manager", timeout_seconds=120)
def run(payload: dict[str, Any]) -> dict[str, Any]:
    """Entrypoint Tensorlake invokes per webhook.

    Convex sync inside `extract_session` is best-effort; failures are
    swallowed so a Convex outage never breaks extraction.
    """
    session_id = payload.get("session_id")
    if not session_id:
        return {"error": "missing session_id"}
    use_llm = bool(payload.get("use_llm", True))
    dry_run = bool(payload.get("dry_run", False))
    return extract_session(session_id, dry_run=dry_run, use_llm=use_llm)


if __name__ == "__main__":
    # Convenience: `python tensorlake/note_manager.py <session_id>` for local smoke test.
    if len(sys.argv) < 2:
        print("usage: python tensorlake/note_manager.py <session_id>")
        sys.exit(1)
    import json
    print(json.dumps(run({"session_id": sys.argv[1]}), indent=2, default=str))
