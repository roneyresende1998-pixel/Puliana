.PHONY: setup dev backend frontend test cost-today clean fix-pth

setup:
	@echo "==> Instalando dependências Python (uv) e Node (npm)..."
	uv sync
	@if [ ! -f frontend/node_modules/.package-lock.json ] && [ ! -d frontend/node_modules ]; then \
		cd frontend && npm install; \
	fi
	@if ! command -v ffmpeg >/dev/null 2>&1; then \
		echo "==> ffmpeg não encontrado, tentando instalar versão portável..."; \
		uv run python scripts/install_ffmpeg.py || echo "Falhou. Rode: brew install ffmpeg"; \
	fi
	@echo "==> Setup concluído. Rode ./setup.sh se ainda não configurou config/.env"

dev:
	@if [ ! -f config/.env ]; then \
		echo "config/.env não existe. Rode ./setup.sh primeiro."; exit 1; \
	fi
	@echo "==> Subindo backend (:8000) e frontend (:5173)..."
	@trap 'kill 0' EXIT; \
	( uv run uvicorn backend.app.main:app --reload --port 8000 ) & \
	( cd frontend && npm run dev -- --port 5173 ) & \
	wait

backend:
	uv run uvicorn backend.app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev -- --port 5173

test:
	uv run pytest backend/tests -v

cost-today:
	uv run python scripts/cost_today.py

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	rm -rf .pytest_cache frontend/dist frontend/.vite
	@echo "Caches limpos."

fix-pth:
	bash scripts/fix_pth.sh
