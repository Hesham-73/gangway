FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV PORT=8080
USER node
EXPOSE 8080
CMD ["node", "src/server.mjs"]
