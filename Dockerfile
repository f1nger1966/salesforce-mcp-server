FROM node:22-slim

WORKDIR /app

# Install dependencies first (layer cache — only re-runs when package files change)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy server source
COPY server.js ./

EXPOSE 3001

CMD ["node", "server.js"]
