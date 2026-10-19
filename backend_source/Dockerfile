FROM oven/bun:1.1
# Programs the backend runs: ffmpeg (videos/audio), tesseract (OCR), pdftoppm (scanned PDF pages)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg tesseract-ocr tesseract-ocr-eng poppler-utils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

EXPOSE 3000
CMD ["bun", "run", "start:dev"]
