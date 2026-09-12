FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 guardian && adduser --system --uid 1001 guardian
COPY --from=builder --chown=guardian:guardian /app/.next/standalone ./
COPY --from=builder --chown=guardian:guardian /app/.next/static ./.next/static
COPY --from=builder --chown=guardian:guardian /app/public ./public
USER guardian
EXPOSE 8080
CMD ["node", "server.js"]
