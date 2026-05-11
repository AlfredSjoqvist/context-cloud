# Makefile — convenience wrappers around the demo + content + eval workflow.
# Authored for hindsight Agent 4 scope; safe to extend.

.PHONY: help eval seed demo agent ui setup-check clean-mirrors

help:
	@echo "Common targets:"
	@echo "  make eval           # run the full eval suite (bash evals/run_all.sh)"
	@echo "  make seed           # mirror .context-map/library/ → every mock_org sub-org"
	@echo "  make agent          # run one Guardian cycle against mock_org/agent-gateway in mock mode"
	@echo "  make ui             # start the Hindsight UI (cd ui && npm run dev)"
	@echo "  make demo           # seed + eval + agent (full pre-flight)"
	@echo "  make setup-check    # confirm prereqs match SETUP.md step 0"
	@echo "  make clean-mirrors  # remove every mock_org/<sub>/.context-map/library/"

eval:
	bash evals/run_all.sh

seed:
	bash seed-context-map.sh

agent:
	DEMO_REPO_LOCAL_PATH="$(PWD)/mock_org/agent-gateway" \
	USE_MOCK_LLM=1 USE_MOCK_DEVIN=1 SKIP_NIA=1 \
	npm run agent:once

ui:
	cd ui && npm run dev

demo: seed eval agent
	@echo "Demo pre-flight complete. Open http://localhost:3000 if ui is running."

setup-check:
	@command -v node >/dev/null  && echo "node: $$(node --version)"  || (echo "node: missing" && exit 1)
	@command -v npm >/dev/null   && echo "npm: $$(npm --version)"    || (echo "npm: missing" && exit 1)
	@command -v python3 >/dev/null && echo "python3: $$(python3 --version)" || (echo "python3: missing" && exit 1)
	@command -v git >/dev/null   && echo "git: $$(git --version)"    || (echo "git: missing" && exit 1)
	@test -d node_modules || (echo "node_modules missing — run: npm install" && exit 1)
	@test -d ui/node_modules || (echo "ui/node_modules missing — run: cd ui && npm install" && exit 1)
	@echo "setup-check: OK"

clean-mirrors:
	@for d in mock_org/*/.context-map; do \
		[ -d "$$d/library" ] && rm -rf "$$d/library" && echo "removed $$d/library" || true; \
	done
