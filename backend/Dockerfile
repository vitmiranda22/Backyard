# =============================================================================
# WanderVox Backend — Dockerfile
# =============================================================================
# This is for deployment (Railway, Render, Fly.io, etc.)
# For local development, just use: uvicorn app.main:app --reload
# =============================================================================

FROM python:3.12-slim

WORKDIR /app

# Install system dependencies (needed for some Python packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (for Docker layer caching — deps don't change often)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the code
COPY . .

# Run the server
# The PORT env var is set by most hosting platforms (Railway, Render, etc.)
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
