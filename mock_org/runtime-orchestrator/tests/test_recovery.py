from pathlib import Path

from runtime.state_store import Checkpoint, StateStore


def test_checkpoint_survives_new_store_instance(tmp_path: Path):
    store = StateStore(tmp_path)
    store.write_checkpoint(Checkpoint(run_id="run_123", step="gc", payload={"cursor": 7}))

    recovered = StateStore(tmp_path).read_checkpoint("run_123")

    assert recovered is not None
    assert recovered.payload["cursor"] == 7
