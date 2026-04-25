# syntax=docker/dockerfile:1.7

# ---- deps stage: install prod-only node_modules ----
FROM node:25-slim AS deps
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# ---- runtime stage: minimal image with app + prod deps ----
FROM node:25-slim
ENV NODE_ENV=production
WORKDIR /usr/src/app

COPY --from=deps --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --chown=node:node . .

USER node
EXPOSE 3000
CMD ["node", "server/server.js"]
