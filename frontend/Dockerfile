# Build stage
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /usr/src/app

# Install serve to run the static site
RUN npm install -g serve

# Copy built assets from builder
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package.json ./package.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1

# Serve the static site
CMD ["serve", "-s", "dist", "-l", "3000"]
