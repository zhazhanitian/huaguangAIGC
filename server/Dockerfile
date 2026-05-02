# 约定：Node 24.11.0 + pnpm
FROM node:24.11.0-alpine AS builder

WORKDIR /app

# 启用 pnpm（Node 自带 corepack）
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm config set registry https://registry.npmmirror.com
RUN pnpm install --prod --frozen-lockfile
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

FROM node:24.11.0-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/main.js"]
