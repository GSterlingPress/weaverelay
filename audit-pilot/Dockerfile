FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr poppler-utils xz-utils ca-certificates coreutils && rm -rf /var/lib/apt/lists/*
COPY runtime.00 runtime.01 runtime.02 runtime.03 runtime.04 runtime.05 runtime.06 runtime.07 /tmp/runtime/
RUN cat /tmp/runtime/runtime.* | base64 --decode > /tmp/audit-runtime.tar.xz \
 && xz --test /tmp/audit-runtime.tar.xz \
 && tar -xJf /tmp/audit-runtime.tar.xz -C /app \
 && test -f /app/app.py \
 && rm -rf /tmp/runtime /tmp/audit-runtime.tar.xz
COPY hardening_patch.py /tmp/hardening_patch.py
RUN python /tmp/hardening_patch.py /app && rm /tmp/hardening_patch.py
COPY app.py /app/app.py
RUN python -m py_compile /app/app.py \
 && pip install --no-cache-dir -r requirements.txt \
 && useradd --create-home --uid 10001 audituser \
 && mkdir -p /tmp/contract-money-audit-jobs \
 && chown -R audituser:audituser /app /tmp/contract-money-audit-jobs
USER audituser
EXPOSE 8080
CMD ["sh","-c","uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
