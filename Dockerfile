# Production image: the frontend and the API in one container, on one origin, for one site.
# Build with --build-arg SITE=<folder under sites/>; render.yaml sets SITE per service.
# For local development use docker-compose.yml instead.

FROM node:26-alpine AS site
ARG SITE
COPY sites/ /sites/
RUN test -n "$SITE" && test -f "/sites/$SITE/site.json" \
    || { echo "Build with --build-arg SITE=<a folder under sites/ that has a site.json>; got '$SITE'." >&2; exit 1; }

FROM node:26-alpine AS frontend
ARG SITE
WORKDIR /repo/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY --from=site /sites/ /repo/sites/
RUN SITE="$SITE" npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend
WORKDIR /src
COPY backend/src/FoodSite.Api/FoodSite.Api.csproj src/FoodSite.Api/
RUN dotnet restore src/FoodSite.Api/FoodSite.Api.csproj
COPY backend/src/ src/
RUN dotnet publish src/FoodSite.Api/FoodSite.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
ARG SITE
WORKDIR /app
COPY --from=backend /app .
# The API reads ./site/site.json (cookie names, templates, seeds) and the site name from ./site/i18n/he.json.
COPY --from=site /sites/${SITE}/ ./site/
COPY --from=frontend /repo/frontend/dist ./wwwroot
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "FoodSite.Api.dll"]
