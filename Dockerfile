FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
# La base vit dans /data (un volume) : elle survit aux mises à jour de l'image.
ENV FLOOR_DB=/data/floor.db PORT=5002
# Le commit construit, que /health donne (scripts/auto-deploy.sh le passe ; l'image n'a pas .git).
ARG FLOOR_COMMIT=
ARG FLOOR_COMMIT_DATE=
ENV FLOOR_COMMIT=$FLOOR_COMMIT FLOOR_COMMIT_DATE=$FLOOR_COMMIT_DATE
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 5002
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:5002/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "src/index.js"]
