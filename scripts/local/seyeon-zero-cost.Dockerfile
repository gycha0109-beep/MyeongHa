# syntax=docker/dockerfile:1
# Watchtower-Track: security
# Build downloads only public Node/OS/npm dependencies. No API credentials,
# paid inference, production DB, ports, or host secrets are accepted.
FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
COPY . .
RUN npm ci --ignore-scripts --no-audit --no-fund \
 && chown -R node:node /workspace

USER node
ENV NODE_ENV=test
ENV XDG_CACHE_HOME=/tmp
ENV npm_config_cache=/tmp/npm-cache

# Each fixture supplies synthetic Auth, SQL, Model, TLS certificate/key.
# The outer launcher forces --network none and no mounts/env secrets.
ENTRYPOINT ["./node_modules/.bin/vitest"]
CMD ["run", "--maxWorkers=2", \
  "test/seyeon-first-zero-direct-https-loopback-host-v1.test.ts", \
  "test/seyeon-first-zero-direct-node-http-ingress-v1.test.ts", \
  "test/seyeon-direct-https-production-composition-v1.test.ts", \
  "test/seyeon-direct-https-service-launcher-v1.test.ts", \
  "test/seyeon-first-zero-node-turn-delivery-v1.test.ts", \
  "test/seyeon-locked-first-zero-node-reveal-v1.test.ts", \
  "test/seyeon-chat-turn-send-http.test.ts"]
