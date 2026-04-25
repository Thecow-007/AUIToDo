# syntax=docker/dockerfile:1.7

# ---- deps stage: install prod-only node_modules for the server ----
FROM node:25-slim AS deps
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# ---- client-build stage: build the Angular bundle ----
FROM node:25-slim AS client-build
WORKDIR /usr/src/app/client
COPY client/package.json client/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY client/ ./
RUN npm run build

# ---- runtime stage: minimal image with app + prod deps + built client ----
FROM node:25-slim
ENV NODE_ENV=production
WORKDIR /usr/src/app

COPY --from=deps --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --chown=node:node . .
COPY --from=client-build --chown=node:node /usr/src/app/client/dist/client/browser ./public

USER node
EXPOSE 3000
CMD ["node", "server/server.js"]
