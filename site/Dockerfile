FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

COPY . .
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund

ENV NODE_ENV=production
ENV KB_HOST=0.0.0.0
ENV KB_PORT=8796
ENV KB_PROJECT_ROOT=/app
ENV KB_CONTENT_DIR=/app/content
ENV KB_RUNTIME_DIR=/app/runtime
ENV KB_PUBLIC_DIR=/app/public
ENV KB_SIYUAN_WORKSPACE_DIR=/app/siyuan/workspace
ENV SIYUAN_BASE_URL=http://siyuan:6806

EXPOSE 8796

CMD ["node", "server/index.js"]
