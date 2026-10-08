# The API alone, for docker-compose.yml. Built from the repo root with --build-arg SITE=<folder under sites/>.

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS site
ARG SITE
COPY sites/ /sites/
RUN test -n "$SITE" && test -f "/sites/$SITE/site.json" \
    || { echo "Build with --build-arg SITE=<a folder under sites/ that has a site.json>; got '$SITE'." >&2; exit 1; }

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/src/FoodSite.Api/FoodSite.Api.csproj src/FoodSite.Api/
RUN dotnet restore src/FoodSite.Api/FoodSite.Api.csproj
COPY backend/src/ src/
RUN dotnet publish src/FoodSite.Api/FoodSite.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
ARG SITE
WORKDIR /app
COPY --from=build /app .
COPY --from=site /sites/${SITE}/ ./site/
COPY --from=site /sites/_shared/ ./_shared/
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "FoodSite.Api.dll"]
