FROM python:3.12-slim

WORKDIR /app

# fonts-dejavu-core: render do criativo (Pillow). ffmpeg: transcode de áudio
# inbound do WhatsApp (opus/ogg/webm → mp4/aac) p/ tocar em qualquer browser.
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
