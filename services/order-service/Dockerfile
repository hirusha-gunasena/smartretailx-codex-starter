FROM node:22-bookworm-slim AS builder

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY packages/api-contracts/package.json ./packages/api-contracts/package.json
COPY services/order-service/package.json ./services/order-service/package.json

RUN npm ci \
    --workspace @smartretailx/api-contracts \
    --workspace @smartretailx/order-service \
    --include-workspace-root=false

COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/api-contracts/tsconfig.json packages/api-contracts/tsconfig.build.json ./packages/api-contracts/
COPY packages/api-contracts/src ./packages/api-contracts/src
COPY services/order-service/tsconfig.json services/order-service/tsconfig.build.json ./services/order-service/
COPY services/order-service/src ./services/order-service/src

RUN npm --workspace @smartretailx/api-contracts run build \
    && npm --workspace @smartretailx/order-service run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY packages/api-contracts/package.json ./packages/api-contracts/package.json
COPY services/order-service/package.json ./services/order-service/package.json

RUN npm ci --omit=dev \
    --workspace @smartretailx/api-contracts \
    --workspace @smartretailx/order-service \
    --include-workspace-root=false \
    && npm cache clean --force

COPY --from=builder /workspace/packages/api-contracts/dist ./packages/api-contracts/dist
COPY --from=builder /workspace/services/order-service/dist ./services/order-service/dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/health').then(response => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "services/order-service/dist/server.js"]
