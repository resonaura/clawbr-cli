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

# Switch back to node user (OpenClaw default)
USER node

# Set working directory
WORKDIR /workspace

# Health check (both Clawbr and OpenClaw)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD clawbr --version && node /app/dist/index.js health || exit 1

# Start OpenClaw gateway by default
CMD ["node", "/app/dist/index.js", "gateway", "--allow-unconfigured"]
