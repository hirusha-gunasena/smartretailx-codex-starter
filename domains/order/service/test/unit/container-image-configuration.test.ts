import { readFileSync } from 'node:fs';

const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
const pinnedAlpineBase =
  'node:22-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32';

describe('Order container image configuration', () => {
  test('pins both build stages to the reviewed Node 22 Alpine image', () => {
    expect(dockerfile.split(`FROM ${pinnedAlpineBase}`).length - 1).toBe(2);
    expect(dockerfile).toContain(`FROM ${pinnedAlpineBase} AS builder`);
    expect(dockerfile).toContain(`FROM ${pinnedAlpineBase} AS runtime`);
    expect(dockerfile).not.toMatch(/FROM\s+\S*latest\b/iu);
  });

  test('keeps build tooling out of the non-root runtime stage', () => {
    const runtimeStage = dockerfile.split(' AS runtime')[1];

    expect(runtimeStage).toBeDefined();
    expect(runtimeStage).not.toMatch(/\b(?:apk|apt-get)\s+(?:add|install)\b/iu);
    expect(runtimeStage).not.toMatch(/\b(?:perl|bash|git|python|make|gcc|g\+\+)\b/iu);
    expect(runtimeStage).toContain('rm -rf /usr/local/lib/node_modules/npm /opt/yarn-v1.22.22');
    expect(runtimeStage).toContain(
      'rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg',
    );
    expect(runtimeStage).toContain('USER node');
    expect(runtimeStage).toContain('EXPOSE 3000');
    expect(runtimeStage).toContain(
      'CMD ["node", "domains/order/service/dist/production-server.js"]',
    );
  });

  test('uses the current DDD workspace paths and copies only compiled output to runtime', () => {
    expect(dockerfile).toContain(
      'COPY core/api-contracts/package.json ./core/api-contracts/package.json',
    );
    expect(dockerfile).toContain(
      'COPY core/event-contracts/package.json ./core/event-contracts/package.json',
    );
    expect(dockerfile).toContain(
      'COPY domains/order/service/package.json ./domains/order/service/package.json',
    );
    expect(dockerfile).toContain(
      'COPY --from=builder /workspace/core/api-contracts/dist ./core/api-contracts/dist',
    );
    expect(dockerfile).toContain(
      'COPY --from=builder /workspace/core/event-contracts/dist ./core/event-contracts/dist',
    );
    expect(dockerfile).toContain(
      'COPY --from=builder /workspace/domains/order/service/dist ./domains/order/service/dist',
    );
    expect(dockerfile).not.toMatch(/(?:COPY|CMD).*\b(?:packages|services)\//u);
  });
});
