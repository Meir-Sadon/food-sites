# Production image: the frontend and the API in one container, on one origin.
# Used by render.yaml. For local development use docker-compose.yml instead.

FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend
WORKDIR /src
COPY backend/src/Kuskus.Api/Kuskus.Api.csproj src/Kuskus.Api/
RUN dotnet restore src/Kuskus.Api/Kuskus.Api.csproj
COPY backend/src/ src/
RUN dotnet publish src/Kuskus.Api/Kuskus.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=backend /app .
COPY --from=frontend /frontend/dist ./wwwroot
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Kuskus.Api.dll"]
