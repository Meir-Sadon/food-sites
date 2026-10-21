# Landing page for the "earn together" offer. Build from the repository root: docker build -f landing/Dockerfile landing
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
