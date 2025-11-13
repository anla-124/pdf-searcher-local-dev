# Multi-stage build for Next.js PDF AI Assistant
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

# Build args for environment variables
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG SUPABASE_SERVICE_ROLE_KEY
ARG GOOGLE_CLOUD_PROJECT_ID
ARG GOOGLE_CLOUD_LOCATION
ARG GOOGLE_CLOUD_PROCESSOR_ID
ARG GOOGLE_CLOUD_FORM_PARSER_ID
ARG GOOGLE_CLOUD_OCR_PROCESSOR_ID
ARG GOOGLE_APPLICATION_CREDENTIALS
ARG QDRANT_URL
ARG QDRANT_API_KEY
ARG QDRANT_COLLECTION_NAME
ARG CRON_SECRET

# Set environment variables from build args
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
ENV GOOGLE_CLOUD_PROJECT_ID=${GOOGLE_CLOUD_PROJECT_ID}
ENV GOOGLE_CLOUD_LOCATION=${GOOGLE_CLOUD_LOCATION}
ENV GOOGLE_CLOUD_PROCESSOR_ID=${GOOGLE_CLOUD_PROCESSOR_ID}
ENV GOOGLE_CLOUD_FORM_PARSER_ID=${GOOGLE_CLOUD_FORM_PARSER_ID}
ENV GOOGLE_CLOUD_OCR_PROCESSOR_ID=${GOOGLE_CLOUD_OCR_PROCESSOR_ID}
ENV GOOGLE_APPLICATION_CREDENTIALS=${GOOGLE_APPLICATION_CREDENTIALS}
ENV QDRANT_URL=${QDRANT_URL}
ENV QDRANT_API_KEY=${QDRANT_API_KEY}
ENV QDRANT_COLLECTION_NAME=${QDRANT_COLLECTION_NAME}
ENV CRON_SECRET=${CRON_SECRET}

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create directories
RUN mkdir -p ./credentials ./scripts

# Copy scripts directory for queue worker
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Note: credentials directory is created but left empty
# Credentials are mounted as volume at runtime (see docker-compose.yml)
# This allows the build to succeed in CI where credentials don't exist

# Copy node_modules for queue worker dependencies
COPY --from=deps /app/node_modules ./node_modules

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
