# The frontend behind nginx, for docker-compose.yml. Built from the repo root with --build-arg SITE=<folder under sites/>.

FROM node:22-alpine AS build
ARG SITE
WORKDIR /repo/frontend
COPY sites/ /repo/sites/
RUN test -n "$SITE" && test -f "/repo/sites/$SITE/site.json" \
    || { echo "Build with --build-arg SITE=<a folder under sites/ that has a site.json>; got '$SITE'." >&2; exit 1; }
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN SITE="$SITE" npm run build

FROM nginx:1.31-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
EXPOSE 80
