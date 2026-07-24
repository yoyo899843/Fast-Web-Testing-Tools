FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 5173

# Vite dev server: hot-reload friendly for this MVP. --host 0.0.0.0 is
# correct here - the loopback-only restriction is enforced by the
# docker-compose port mapping (127.0.0.1:5173:5173), not by this bind address.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
