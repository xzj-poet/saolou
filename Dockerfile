# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS tools
COPY . .
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN npm run db:generate

FROM tools AS builder
ENV NODE_ENV=production
ENV ADMIN_USERNAME=build
ENV ADMIN_PASSWORD=build-only-password
RUN npm run build

FROM node:24-alpine AS app
ARG GIT_COMMIT=unknown
WORKDIR /app
ENV NODE_ENV=production
LABEL org.opencontainers.image.revision=$GIT_COMMIT
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
