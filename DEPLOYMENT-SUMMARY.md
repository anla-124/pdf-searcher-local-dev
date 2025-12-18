# Deployment Summary for IT Team

## Overview
This document provides a quick reference for deploying the PDF Search application to your company server using Docker.

## Latest Changes (Dec 18, 2025)
- Improved table UI responsiveness for small screens
- Shortened button labels to prevent collisions
- Fixed text truncation in Name columns
- Optimized column widths for better mobile/tablet experience

**Latest commit:** `2e6b714` - "feat: improve table UI responsiveness and button labels"

## Quick Deployment (5 Minutes)

### Prerequisites
- Docker Engine 20.10+
- Docker Compose 2.0+
- 4GB RAM minimum (8GB recommended)
- Google Cloud credentials (Document AI + Vertex AI)

### Deployment Steps

```bash
# 1. Clone repository
git clone https://github.com/anla-124/pdf-search.git
cd pdf-search

# 2. Configure environment
cp .env.free.template .env.local
# Edit .env.local with your values (see Configuration section below)

# 3. Add Google credentials
mkdir -p credentials
cp /path/to/google-service-account.json credentials/

# 4. Start services
docker-compose up -d --build

# 5. Verify deployment
curl http://localhost:3000/api/health
```

## Configuration

### Required Environment Variables

Edit `.env.local` with the following:

```bash
# Google Cloud (Required)
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_LOCATION=us
GOOGLE_CLOUD_PROCESSOR_ID=your-processor-id
GOOGLE_CLOUD_OCR_PROCESSOR_ID=your-ocr-processor-id
GOOGLE_APPLICATION_CREDENTIALS=./credentials/google-service-account.json

# Database (Supabase - Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Vector Database (Using Docker service)
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=  # Leave empty for local
QDRANT_COLLECTION_NAME=pdf_embeddings

# Job Processing (Required)
CRON_SECRET=generate-secure-random-string-here

# Database Connection Pool (Important!)
DB_POOL_MIN_CONNECTIONS=5
DB_POOL_MAX_CONNECTIONS=80
DB_POOL_IDLE_TIMEOUT=300000
DB_POOL_CONNECTION_TIMEOUT=30000
```

**Generate secure CRON_SECRET:**
```bash
openssl rand -base64 32
```

## Architecture

```
┌─────────────────┐
│   User Browser  │
└────────┬────────┘
         │ :3000
         ↓
┌─────────────────┐     ┌──────────────┐     ┌──────────────┐
│  PDF Search App │────→│   Qdrant     │     │  Supabase    │
│  + Cron (60s)   │     │  (vectors)   │     │  (database)  │
└─────────────────┘     └──────────────┘     └──────────────┘
         │
         ↓
┌─────────────────┐
│  Google Cloud   │
│  Document AI    │
│  Vertex AI      │
└─────────────────┘
```

## Services

| Service | Purpose | Port | Required |
|---------|---------|------|----------|
| pdf-ai-assistant | Main app + cron | 3000 | Yes |
| qdrant | Vector database | 6333 | Yes |
| postgres | SQL database | 5432 | Optional (using Supabase) |

## Common Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f pdf-ai-assistant

# Check service status
docker-compose ps

# Restart after config change
docker-compose restart pdf-ai-assistant

# Stop all services
docker-compose down

# Full rebuild
docker-compose down && docker-compose up -d --build
```

## Monitoring

### Health Checks
```bash
# App health
curl http://localhost:3000/api/health

# Database pool status
curl http://localhost:3000/api/health/pool

# Qdrant status
curl http://localhost:6333/
```

### Job Queue
```bash
# Check queue status
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:3000/api/cron/process-jobs

# View cron logs
docker-compose exec pdf-ai-assistant cat /var/log/cron.log
```

## Production Checklist

- [ ] Set strong `CRON_SECRET` (use `openssl rand -base64 32`)
- [ ] Configure firewall (allow port 3000)
- [ ] Set up HTTPS/reverse proxy (see deployment/DOCKER-DEPLOYMENT.md)
- [ ] Enable automated backups for Qdrant volumes
- [ ] Configure monitoring/alerts
- [ ] Test concurrent uploads (see deployment/TESTING.md)
- [ ] Document access credentials securely

## Firewall Configuration

```bash
# Allow app port
sudo ufw allow 3000/tcp

# Optional: Allow Qdrant externally (if needed)
sudo ufw allow 6333/tcp
```

## HTTPS Setup (Optional but Recommended)

Using Nginx as reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name pdf-search.company.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Backup Strategy

### Qdrant Data
```bash
# Backup Qdrant vectors
docker run --rm \
  -v pdf-search_qdrant-storage:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/qdrant-$(date +%Y%m%d).tar.gz /data
```

### Database
Supabase provides automated backups. For self-hosted PostgreSQL:
```bash
docker-compose exec postgres pg_dump -U postgres pdf_search > backup.sql
```

## Troubleshooting

### App won't start
```bash
# Check logs
docker-compose logs pdf-ai-assistant

# Common issues:
# 1. Missing credentials file
ls -la credentials/google-service-account.json

# 2. Port already in use
lsof -i:3000
```

### Jobs not processing
```bash
# Check cron is running
docker-compose exec pdf-ai-assistant ps aux | grep crond

# Manual trigger
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/process-jobs
```

### Qdrant connection failed
```bash
# Check Qdrant is running
curl http://localhost:6333/

# Restart Qdrant
docker-compose restart qdrant
```

## Resource Requirements

### Minimum (Testing)
- CPU: 2 cores
- RAM: 4GB
- Disk: 20GB

### Recommended (Production)
- CPU: 4 cores
- RAM: 8GB
- Disk: 100GB (depends on document volume)

## Performance Tuning

To handle more concurrent uploads, edit `.env.local`:

```bash
# Increase from 10 to 20 concurrent documents
MAX_CONCURRENT_DOCUMENTS=20

# Increase upload limits
UPLOAD_GLOBAL_LIMIT=24
UPLOAD_PER_USER_LIMIT=10
```

Then restart:
```bash
docker-compose restart pdf-ai-assistant
```

## Documentation

- **Quick Start:** `DOCKER-QUICK-START.md` (5-minute setup)
- **Full Guide:** `deployment/DOCKER-DEPLOYMENT.md` (detailed instructions)
- **Monitoring:** `deployment/MONITORING.md` (health checks, logs, metrics)
- **Testing:** `deployment/TESTING.md` (concurrent upload tests, validation)
- **macOS Service:** `deployment/launchd/INSTALL-MACOS.md` (optional)

## Support Contacts

- **Repository:** https://github.com/anla-124/pdf-search
- **Issues:** https://github.com/anla-124/pdf-search/issues

## Next Steps After Deployment

1. Verify health endpoints are responding
2. Upload a test document
3. Run similarity search test
4. Monitor logs for any errors
5. Set up automated backups
6. Configure monitoring/alerting
7. Test concurrent uploads (see deployment/TESTING.md)

---

**Deployment Date:** December 18, 2025
**Version:** Latest (commit: 2e6b714)
**Prepared by:** Claude Code
