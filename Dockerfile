FROM node:22-alpine
WORKDIR /app
COPY package.json README.md LICENSE server.json smithery.yaml glama.json ./
COPY bin ./bin
ENTRYPOINT ["node", "bin/cli.mjs"]