from runtime.scheduler import Scheduler


def test_reserve_is_idempotent_per_run_id():
    scheduler = Scheduler()
    run = scheduler.next_gc_run("org_123")

    assert scheduler.reserve(run) is True
    assert scheduler.reserve(run) is False
