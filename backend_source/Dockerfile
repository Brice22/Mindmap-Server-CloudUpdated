FROM oven/bun:latest
RUN apt-get update && apt-get install -y curl gnupg lsb-release && \
    curl -fsSL https://aquasecurity.github.io/trivy-repo/deb/public.key | gpg --dearmor -o /usr/share/keyrings/trivy.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | tee -a /etc/apt/sources.list.d/trivy.list && \
    apt-get update && apt-get install -y trivy
WORKDIR /app

# The container will run 'bun install' automatically
COPY package.json ./
RUN bun install

COPY . .

EXPOSE 3000
# Running in dev mode with watch enabled
CMD ["bun", "run", "start:dev"]
