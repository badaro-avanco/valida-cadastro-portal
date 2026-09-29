FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY src/ValidaCadastro/ValidaCadastro.csproj ValidaCadastro/
RUN dotnet restore ValidaCadastro/ValidaCadastro.csproj
COPY src/ValidaCadastro/ ValidaCadastro/
RUN dotnet publish ValidaCadastro/ValidaCadastro.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "ValidaCadastro.dll"]
