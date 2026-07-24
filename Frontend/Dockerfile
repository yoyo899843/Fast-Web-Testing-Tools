FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 8081

# Vite dev server: hot-reload friendly for this MVP. --host 0.0.0.0 is
# correct here - the loopback-only restriction is enforced by the
# docker-compose port mapping (127.0.0.1:8081:8081), not by this bind address.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8081"]
