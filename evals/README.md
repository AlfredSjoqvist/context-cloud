# evals/

Test harness that proves the Hindsight agents are actually correct, not just
that they run.

## Quality bar

Every eval here must:

1. **Pass on known-good input.**
2. **Fail on a known-bad input** — i.e. if you mutate the source-under-test in
   a way that breaks the invariant, the eval must turn red. Each eval file's
   docstring lists the exact mutation that breaks it (the "self-test").
3. **Run with stdlib only**, no pytest, no third-party deps. Anything heavier
   gets isolated to `evals/<name>/requirements.txt` and gated in `run_all.sh`.

If you can't make an eval fail by breaking the source it covers, it isn't an
eval — it's a placebo. Delete it.

## Layout

```
evals/
  README.md                   ← you are here
  run_all.sh                  ← orchestrator; nonzero exit on any failure
  test_hurdle_threshold.py    ← NM: hurdle scoring respects threshold + cluster gap
```

## Running

```bash
bash evals/run_all.sh
```

Or one at a time:

```bash
python3 evals/test_hurdle_threshold.py -v
```

All evals chdir to repo root and import the project's modules in-place. No
install step required.

## Adding a new eval

1. Pick the invariant. It must be one a regression could silently break.
2. Write the test using `unittest.TestCase`. Stdlib only.
3. Add a `# self-test:` comment at the top of the file with the precise
   mutation that breaks every assertion in the file. (e.g.
   `# self-test: set HURDLE_THRESHOLD = 0.5 in nm_signals.py → all "negative"
   cases fail.`)
4. Verify the self-test by hand. If you can't make the eval fail, the
   invariant isn't real or the test isn't checking what it claims.
5. Append the script to `run_all.sh`.
