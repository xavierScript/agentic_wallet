.DEFAULT_GOAL := help

# ── Variables ────────────────────────────────────────────────────────────────
CLI_DIST  := packages/cli/dist/index.js
MCP_DIST  := packages/mcp-server/dist/index.js

# ── Help ─────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo.
	@echo  agentic-wallet — available targets
	@echo  ────────────────────────────────────────────────────────────
	@echo  make install        Install all dependencies (pnpm install)
	@echo.
	@echo  make build          Build all packages (core → cli → mcp-server)
	@echo  make build-core     Build wallet-core only
	@echo  make build-cli      Build CLI only
	@echo  make build-mcp      Build MCP server only
	@echo.
	@echo  make dev            Watch all packages in parallel
	@echo  make dev-core       Watch wallet-core
	@echo  make dev-cli        Watch CLI
	@echo  make dev-mcp        Watch MCP server
	@echo.
	@echo  make test           Run all tests
	@echo  make test-watch     Run tests in watch mode
	@echo.
	@echo  make start          Build everything then launch the TUI
	@echo  make cli            Build CLI then launch the TUI
	@echo  make mcp            Build MCP server then run it
	@echo.
	@echo  make clean          Remove all dist/ folders
	@echo  make clean-core     Remove wallet-core/dist
	@echo  make clean-cli      Remove cli/dist
	@echo  make clean-mcp      Remove mcp-server/dist
	@echo.
	@echo  make rebuild        clean + build
	@echo  ────────────────────────────────────────────────────────────
	@echo.

# ── Install ──────────────────────────────────────────────────────────────────
.PHONY: install
install:
	pnpm install

# ── Build ────────────────────────────────────────────────────────────────────
.PHONY: build
build:
	pnpm --filter @agentic-wallet/core build
	pnpm --filter @agentic-wallet/cli build
	pnpm --filter @agentic-wallet/mcp-server build

.PHONY: build-core
build-core:
	pnpm --filter @agentic-wallet/core build

.PHONY: build-cli
build-cli:
	pnpm --filter @agentic-wallet/cli build

.PHONY: build-mcp
build-mcp:
	pnpm --filter @agentic-wallet/mcp-server build

# ── Dev (watch) ──────────────────────────────────────────────────────────────
.PHONY: dev
dev:
	pnpm -r --parallel dev

.PHONY: dev-core
dev-core:
	pnpm --filter @agentic-wallet/core dev

.PHONY: dev-cli
dev-cli:
	pnpm --filter @agentic-wallet/cli dev

.PHONY: dev-mcp
dev-mcp:
	pnpm --filter @agentic-wallet/mcp-server dev

# ── Test ─────────────────────────────────────────────────────────────────────
.PHONY: test
test:
	pnpm -r test

.PHONY: test-watch
test-watch:
	pnpm --filter @agentic-wallet/core exec vitest

# ── Run ──────────────────────────────────────────────────────────────────────
.PHONY: start
start: build
	node $(CLI_DIST)

.PHONY: cli
cli: build-cli
	node $(CLI_DIST)

.PHONY: mcp
mcp: build-mcp
	node $(MCP_DIST)

# ── Clean ────────────────────────────────────────────────────────────────────
.PHONY: clean
clean:
	pnpm -r clean

.PHONY: clean-core
clean-core:
	pnpm --filter @agentic-wallet/core clean

.PHONY: clean-cli
clean-cli:
	pnpm --filter @agentic-wallet/cli clean

.PHONY: clean-mcp
clean-mcp:
	pnpm --filter @agentic-wallet/mcp-server clean

# ── Rebuild ──────────────────────────────────────────────────────────────────
.PHONY: rebuild
rebuild: clean build
