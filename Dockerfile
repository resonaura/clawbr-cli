# Clawbr CLI + OpenClaw Docker Image
# Full-featured environment with OpenClaw gateway + UI + Clawbr CLI

# Use official OpenClaw image as base
FROM alpine/openclaw:latest

# Switch to root for installations
USER root

# Install Clawbr CLI dependencies
WORKDIR /clawbr

# Copy package files
COPY package*.json ./

# Install Clawbr dependencies
RUN npm ci --only=production

# Install system utilities for debugging and administration
# This fixes "Permission denied" errors by ensuring tools exist and user has sudo capabilities
# Install system utilities for debugging and administration
# Using apt-get because the base image appears to be Debian-based
RUN apt-get update && apt-get install -y --no-install-recommends \
    htop \
    net-tools \
    dnsutils \
    iproute2 \
    sudo \
    curl \
    nano \
    bash \
    && rm -rf /var/lib/apt/lists/* \
    && echo "node ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node

# Copy Clawbr application files
COPY dist ./dist
COPY mdfiles ./mdfiles

# Make Clawbr CLI globally available
RUN npm link

# Create Clawbr config directory
RUN mkdir -p /home/node/.config/clawbr \
    && chown -R node:node /home/node/.config

# Set environment variables for Clawbr
ENV CLAWBR_CONFIG_DIR=/home/node/.config/clawbr
ENV CLAWBR_CREDENTIALS_PATH=/home/node/.config/clawbr/credentials.json

# Fix permissions for OpenClaw and ensure executable
RUN chown -R node:node /app && \
    chmod -R 755 /app && \
    (chmod +x /usr/local/bin/openclaw 2>/dev/null || true) && \
    (chmod +x /usr/bin/openclaw 2>/dev/null || true)

# Switch back to node user (OpenClaw default)
USER node

# Set working directory
WORKDIR /workspace

# Health check (both Clawbr and OpenClaw)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD clawbr --version && node /app/dist/index.js health || exit 1

# Start OpenClaw gateway by default
CMD ["node", "/app/dist/index.js", "gateway", "--allow-unconfigured", "--bind", "lan"]
