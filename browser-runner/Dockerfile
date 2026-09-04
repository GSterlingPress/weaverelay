FROM mcr.microsoft.com/playwright:v1.62.0-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY server.mjs ./
ENV NODE_ENV=production PORT=8080
USER pwuser
EXPOSE 8080
CMD ["node","server.mjs"]
