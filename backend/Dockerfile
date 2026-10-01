# The API as a Docker image (used by deploy/docker-compose.yml).
#   build   — installs everything, generates the Prisma client and compiles TypeScript.
#             Also used on its own to run database migrations (`prisma migrate deploy`).
#   runtime — only what's needed to run: compiled code + production packages, as a non-root user.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Uploaded files live here — mounted as a volume so they survive updates.
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
ENV UPLOAD_DIR=/app/uploads
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:4000/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/src/server.js"]
