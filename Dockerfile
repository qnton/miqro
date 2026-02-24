# Use the official Bun image
FROM oven/bun:1.1 as base

# Set working directory
WORKDIR /usr/src/app

# Stage 1: Install dependencies
FROM base AS install
# Copy package files
COPY package.json bun.lockb ./
# Install ALL dependencies (including dev) to keep image small
RUN bun install --frozen-lockfile

# Stage 2: Create production build (optional if you want to compile, else just copy)
# FROM install AS build
# RUN bun run build # If you use bun build

# Stage 3: Release
FROM base AS release
# Copy node_modules from install stage
COPY --from=install /usr/src/app/node_modules node_modules/
# Copy application code
COPY package.json .
COPY src src/

# Run as non-root user
USER bun

# Expose port (must match index.ts)
EXPOSE 3000

# Start application
CMD ["bun", "run", "src/index.ts"]
