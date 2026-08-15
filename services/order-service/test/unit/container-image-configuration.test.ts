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
      'CMD ["node", "services/order-service/dist/production-server.js"]',
    );
  });

  test('copies only compiled workspace output from the builder stage', () => {
    expect(dockerfile).toContain(
      'COPY --from=builder /workspace/packages/api-contracts/dist ./packages/api-contracts/dist',
    );
    expect(dockerfile).toContain(
      'COPY --from=builder /workspace/packages/event-contracts/dist ./packages/event-contracts/dist',
    );
    expect(dockerfile).toContain(
      'COPY --from=builder /workspace/services/order-service/dist ./services/order-service/dist',
    );
  });
});
