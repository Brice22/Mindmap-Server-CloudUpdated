FROM oven/bun:latest
WORKDIR /app

# The container will run 'bun install' automatically
COPY package.json ./
RUN bun install

COPY . .

EXPOSE 3000
# Running in dev mode with watch enabled
CMD ["bun", "run", "start:dev"]
