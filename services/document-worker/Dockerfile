FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
# libmagic backs file-type sniffing (python-magic). Office conversion and OCR
# run on Aliyun IMM/OCR and PDF rasterisation on PyMuPDF, so this image needs
# no office suite, CJK fonts or Poppler.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 10001 worker
WORKDIR /app
COPY requirements.lock .
RUN python -m pip install --requirement requirements.lock
COPY app ./app
COPY scripts ./scripts
RUN mkdir -p /tmp/oa-agent && chown -R worker:worker /app /tmp/oa-agent
USER worker
EXPOSE 8080
CMD ["python", "-m", "app.main"]
