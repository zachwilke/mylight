.PHONY: dev build test up down
dev:
	npm run dev
build:
	npm ci
	npm run build
	mkdir -p go-server/web/dist
	cp -R dist/. go-server/web/dist/
	go build -C go-server -o ../mylight .
test:
	npm run typecheck
	npm run lint
	go test -C go-server -race ./...
up:
	docker compose up -d --build
down:
	docker compose down
