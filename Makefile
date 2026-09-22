.PHONY: help install dev frontend test verify lint clean docker-up docker-down

help:
	@echo "Big Data Energy Consumption Analytics Platform"
	@echo "Available commands:"
	@echo "  make install     - Install Python dependencies"
	@echo "  make dev         - Run unified development gateway on port 8000"
	@echo "  make frontend    - Start React Vite frontend development server"
	@echo "  make test        - Run complete automated test suite (pytest)"
	@echo "  make verify      - Run independent analytics correctness triangulation"
	@echo "  make docker-up   - Launch full stack via Docker Compose"
	@echo "  make docker-down - Tear down Docker Compose containers"
	@echo "  make clean       - Remove cache files and build artifacts"

install:
	pip install -r requirements.txt
	cd frontend && npm install

dev:
	python scripts/dev_server.py

frontend:
	cd frontend && npm run dev

test:
	pytest tests/ -v

verify:
	python tests/correctness/verify_analytics.py

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down -v

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	rm -rf frontend/dist
