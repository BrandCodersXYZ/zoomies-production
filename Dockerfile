FROM node:20-slim

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src
RUN npm install typescript --save-dev && npx tsc

# Copy static UI assets
COPY ui ./ui

# Clean up dev deps
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3333

EXPOSE 3333

CMD ["node", "dist/index.js", "serve"]
