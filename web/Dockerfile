# The website, built and served by Caddy (used by deploy/docker-compose.yml).
# The API is reached on the same domain at /api/v1, so the login cookie just works.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_API_URL=/api/v1
RUN npm run build

FROM caddy:2
COPY --from=build /app/dist /srv
