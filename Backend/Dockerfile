FROM kalilinux/kali-rolling

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    git \
    python3 \
    python3-pip \
    python3-venv \
    sqlmap \
    dirsearch \
    gitleaks \
    wpscan \
    whatweb \
    ruby-full \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# Kali's Python is a Debian "externally managed" install (PEP 668); this
# image only ever runs this one app, so --break-system-packages is the
# accepted way to install into it directly instead of a venv.
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt \
    && pip install --no-cache-dir --break-system-packages git-dumper \
    # Python deps for scripts under tools/ (e.g. php-cgi-Injector); not app deps.
    && pip install --no-cache-dir --break-system-packages requests rich chardet requests-tor

COPY app ./app

EXPOSE 8000

# --workers 1 is required, not a default: the job engine's in-memory job
# registry and WebSocket subscriber lists are per-process state.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
