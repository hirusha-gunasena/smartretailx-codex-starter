FROM node:22-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY core/api-contracts/package.json ./core/api-contracts/package.json
COPY core/event-contracts/package.json ./core/event-contracts/package.json
COPY domains/order/service/package.json ./domains/order/service/package.json

RUN npm ci \
    --workspace @smartretailx/api-contracts \
    --workspace @smartretailx/event-contracts \
    --workspace @smartretailx/order-service \
    --include-workspace-root=false

COPY tsconfig.base.json ./tsconfig.base.json
COPY core/api-contracts/tsconfig.json core/api-contracts/tsconfig.build.json ./core/api-contracts/
COPY core/api-contracts/src ./core/api-contracts/src
COPY core/event-contracts/tsconfig.json core/event-contracts/tsconfig.build.json ./core/event-contracts/
COPY core/event-contracts/src ./core/event-contracts/src
COPY domains/order/service/tsconfig.json domains/order/service/tsconfig.build.json ./domains/order/service/
COPY domains/order/service/src ./domains/order/service/src

RUN npm --workspace @smartretailx/api-contracts run build \
    && npm --workspace @smartretailx/event-contracts run build \
    && npm --workspace @smartretailx/order-service run build

FROM node:22-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY core/api-contracts/package.json ./core/api-contracts/package.json
COPY core/event-contracts/package.json ./core/event-contracts/package.json
COPY domains/order/service/package.json ./domains/order/service/package.json

RUN npm ci --omit=dev \
    --workspace @smartretailx/api-contracts \
    --workspace @smartretailx/event-contracts \
    --workspace @smartretailx/order-service \
    --include-workspace-root=false \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY --from=builder /workspace/core/api-contracts/dist ./core/api-contracts/dist
COPY --from=builder /workspace/core/event-contracts/dist ./core/event-contracts/dist
COPY --from=builder /workspace/domains/order/service/dist ./domains/order/service/dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/health').then(response => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "domains/order/service/dist/production-server.js"]
