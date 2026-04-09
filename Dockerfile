FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Crear directorios necesarios
RUN mkdir -p /vault /data

CMD ["node", "dist/index.js"]
