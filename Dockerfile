# Multi-Stage Hardened Production Dockerfile for Zero Trust Machine Customer
# Stage 1: Build Dependencies
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Hardened Production Runtime
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create unprivileged non-root service user (NIST SP 800-190 Hardening)
RUN addgroup --system --gid 10001 machinecustomer && \
    adduser --system --uid 10001 --ingroup machinecustomer machineagent

# Copy built application assets with restricted permissions
COPY --from=builder /app/public ./public
COPY --from=builder --chown=machineagent:machinecustomer /app/.next/standalone ./
COPY --from=builder --chown=machineagent:machinecustomer /app/.next/static ./.next/static

USER machineagent

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
