FROM node:22-alpine
WORKDIR /app
COPY services/notification/package.json ./
