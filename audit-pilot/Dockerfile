FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr poppler-utils xz-utils ca-certificates coreutils && rm -rf /var/lib/apt/lists/*
COPY bundle.00 bundle.01 bundle.02 bundle.03 bundle.04 bundle.05 bundle.06 /tmp/bundle/
RUN for f in /tmp/bundle/bundle.*; do base64 --decode "$f"; done > /tmp/audit-runtime.tar.xz \
 && xz --test /tmp/audit-runtime.tar.xz \
 && tar -xJf /tmp/audit-runtime.tar.xz -C /app \
 && test -f /app/app.py \
 && rm -rf /tmp/bundle /tmp/audit-runtime.tar.xz
RUN pip install --no-cache-dir -r requirements.txt \
 && useradd --create-home --uid 10001 audituser \
 && mkdir -p /tmp/contract-money-audit-jobs \
 && chown -R audituser:audituser /app /tmp/contract-money-audit-jobs
USER audituser
EXPOSE 8080
CMD ["sh","-c","uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
