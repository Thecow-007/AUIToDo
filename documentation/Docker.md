# Docker

## Using Docker
- Run with `docker compose up -d`

## Accessing on Localhost
- You need to add the following to your docker-compose.override.yml file:
```yml
services:
  auitodo:
    ports:
      - ${PORT}:${PORT}
```