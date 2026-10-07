FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/Kuskus.Api/Kuskus.Api.csproj src/Kuskus.Api/
RUN dotnet restore src/Kuskus.Api/Kuskus.Api.csproj
COPY src/ src/
RUN dotnet publish src/Kuskus.Api/Kuskus.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Kuskus.Api.dll"]
