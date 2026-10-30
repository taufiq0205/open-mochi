# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_TRIGGER_API_URL=http://localhost:8030
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_TRIGGER_API_URL=$NEXT_PUBLIC_TRIGGER_API_URL
COPY . .
# Route collection initializes auth/database without connecting; this key exists only in the build process.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build BETTER_AUTH_URL=http://localhost:3000 \
    node -e "process.env.BETTER_AUTH_SECRET=require('node:crypto').randomBytes(32).toString('hex');require('node:child_process').execFileSync('npm',['run','build'],{stdio:'inherit',env:process.env})"

# Private desktop relay: independent of the Next.js HTTP server.
FROM node:24-bookworm-slim AS desktop-proxy
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules/ws ./node_modules/ws
COPY --chown=node:node scripts/desktop-proxy.mjs ./scripts/
COPY --chown=node:node lib/desktop-ticket.mjs ./lib/
USER node
EXPOSE 3001
CMD ["node", "scripts/desktop-proxy.mjs"]

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node
EXPOSE 3000
CMD ["node", "server.js"]
