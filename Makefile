.PHONY: up down migrate seed backend frontend

up:
	docker compose up -d
	echo "Services started"

down:
	docker compose down

migrate:
	./scripts/migrate.sh

seed:
	./scripts/seed.sh

backend:
	cd backend && npm run dev

frontend:
	cd frontend && npm run dev
