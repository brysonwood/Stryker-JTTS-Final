FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Prisma generation runs during npm install, so the schema must exist first.
COPY package.json package-lock.json* ./
COPY prisma ./prisma

RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build

FROM node:20-alpine

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./
COPY prisma ./prisma

RUN npm ci --omit=dev

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "dist/index.js"]
