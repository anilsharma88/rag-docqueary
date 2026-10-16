# Use an official lightweight Python image
FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies needed for compiling certain Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    antiword \
    && rm -rf /var/lib/apt/lists/*

# Copy only the requirements file first to optimize Docker layer caching
COPY requirements.txt .

# Install CPU-only PyTorch for the Sentence Transformers embedding service
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu "torch==2.14.1+cpu"

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Keep the application in the package directory expected by its imports
COPY . ./app

# Expose the port FastAPI runs on
EXPOSE 8000

# Start FastAPI using Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
