FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && printf '%s\n' 'Types: deb' 'URIs: https://apt.postgresql.org/pub/repos/apt' 'Suites: bookworm-pgdg' 'Architectures: arm64 amd64' 'Components: main' 'Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc' > /etc/apt/sources.list.d/pgdg.sources \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 rsync \
 && rm -rf /var/lib/apt/lists/*

# Музыкальный плеер (docs/music.md): ffmpeg (длительность, обложка, перекодирование) и yt-dlp (скачивание по ссылке).
# yt-dlp: готовый бинарник без Python; обновляется при каждой пересборке образа (YouTube часто меняется: если скачивание перестало работать, пересобери образ).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/* \
 && case "$(dpkg --print-architecture)" in arm64) YT=yt-dlp_linux_aarch64 ;; *) YT=yt-dlp_linux ;; esac \
 && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$YT" -o /usr/local/bin/yt-dlp \
 && chmod 755 /usr/local/bin/yt-dlp

FROM base AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json nest-cli.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate
COPY src ./src
COPY assets ./assets
RUN npm run build

FROM build AS test
COPY test ./test
COPY vitest.config.mts ./
CMD ["npm", "test"]

FROM base
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY --from=build /app/dist ./dist
COPY assets ./assets
COPY scripts ./scripts
RUN mkdir -p /data && chown -R node:node /app /data
USER node
ENV DATA_DIR=/data
EXPOSE 3001
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
