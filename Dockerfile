# syntax=docker/dockerfile:1

# ---- build: install everything, build the app, then keep only production dependencies ----
FROM node:24-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 compiles a native module during `npm ci`.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:24-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/mehzur.db \
    PHOTOS_PATH=/data/photos \
    MIGRATIONS_PATH=/app/drizzle \
    BODY_SIZE_LIMIT=20M \
    PLAIN_HTTP=true

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY docker/server.js ./server.js

# The SQLite database and photos live here; mount a volume over it.
RUN mkdir -p /data && chown -R node:node /data
VOLUME /data

USER node
EXPOSE 3000

# /login is public, and returns an error if APP_PASSWORD / SESSION_SECRET are missing.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/login').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "server.js"]
