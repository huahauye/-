FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-core poppler-utils libmagic1 fonts-noto-cjk fonts-liberation \
    libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 10001 worker
WORKDIR /app
COPY requirements.lock .
RUN python -m pip install --requirement requirements.lock
COPY app ./app
RUN mkdir -p /tmp/oa-agent && chown -R worker:worker /app /tmp/oa-agent
USER worker
EXPOSE 8080
CMD ["python", "-m", "app.main"]
