FROM node:22-alpine
WORKDIR /app
COPY services/document-storage/package.json ./
