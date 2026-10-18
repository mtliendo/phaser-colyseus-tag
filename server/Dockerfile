FROM node:22-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json

RUN pnpm install --frozen-lockfile --filter @tag/server...

COPY shared shared
COPY server server

WORKDIR /app/server
EXPOSE 2567
ENV NODE_ENV=production
ENV PORT=2567

CMD ["pnpm", "exec", "tsx", "src/index.ts"]
