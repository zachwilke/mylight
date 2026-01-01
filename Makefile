new:
	git pull
	npm install
	npm run build
	cd go-server && go build -o server .
	cd go-server && ./server
