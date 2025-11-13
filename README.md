# PDF Searcher

A web application for processing PDF documents and performing similarity searches.

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Authentication:** [Supabase](https://supabase.io/)
- **Vector Search:** [Qdrant](https://qdrant.tech/)
- **Document Processing:** [Google Cloud Document AI](https://cloud.google.com/document-ai)
- **PDF Handling:** [pdf-lib](https://pdf-lib.js.org/)
- **Linting:** [ESLint](https://eslint.org/)
- **Testing:** [Vitest](https://vitest.dev/), [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Supabase Project
- Google Cloud Project with Document AI and Vertex AI APIs enabled
- Qdrant Instance (local or cloud)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/anla-124/pdf-searcher.git
    cd pdf-searcher
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

### Local Development Setup

For local development, you'll need to set up local instances of Supabase and Qdrant. This approach bypasses VPN authentication issues and allows for offline development.

#### 1. Install Prerequisites

- **Node.js** (v18 or higher)
- **Docker Desktop** (for running Qdrant locally)
  - Download from [docker.com](https://www.docker.com/products/docker-desktop)
  - Make sure Docker is running before proceeding
- **Supabase CLI** (if not already installed):
  ```bash
  npm install -g supabase
  ```

#### 2. Set Up Local Supabase

**Initialize Supabase (first time only):**
```bash
# This creates the supabase/ directory with configuration
npx supabase init
```

**Start Supabase:**
```bash
npx supabase start
```

This will:
- Start all Supabase services in Docker containers
- Display connection credentials in the terminal (save these!)
- Start Supabase Studio at `http://127.0.0.1:54323`

**Stop Supabase:**
```bash
npx supabase stop
```

**Reset Supabase (WARNING: deletes all data):**
```bash
npx supabase db reset
```

#### 3. Set Up Local Qdrant

**Start Qdrant:**
```bash
# Run this from the project root directory
docker run -d \
  -p 6333:6333 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  --name qdrant \
  qdrant/qdrant
```

This will:
- Start Qdrant on port 6333
- Store data in the `qdrant_storage/` directory
- Run in detached mode (background)

**Initialize Qdrant Collection (first time only):**
```bash
npx tsx init-qdrant-collection.ts
```

**Stop Qdrant:**
```bash
docker stop qdrant
```

**Start existing Qdrant container:**
```bash
docker start qdrant
```

**Remove Qdrant container:**
```bash
docker rm -f qdrant
```

**View Qdrant logs:**
```bash
docker logs qdrant
```

**Access Qdrant Dashboard:**
Open `http://localhost:6333/dashboard` in your browser

#### 4. Configure Environment Variables

**Copy the development template:**
```bash
cp .env.dev.template .env.local
```

**Fill in the required values:**

1. **Supabase credentials** (from `npx supabase start` output):
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key_from_terminal>
   SUPABASE_SERVICE_ROLE_KEY=<service_role_key_from_terminal>
   ```

2. **Google Cloud credentials** (required for document processing):
   - Set up a Google Cloud project with Document AI enabled
   - Download service account JSON credentials
   - Place in `./credentials/google-service-account.json`
   - Update environment variables accordingly

3. **Draftable credentials** (for document comparison):
   - Sign up at [draftable.com](https://draftable.com)
   - Get your account ID and auth token
   - Update environment variables

4. **Generate a CRON secret:**
   ```bash
   CRON_SECRET=<generate_a_secure_random_string>
   ```

#### 5. Set Up Database Schema

Run the database setup script in Supabase Studio:
1. Open Supabase Studio at `http://127.0.0.1:54323`
2. Navigate to SQL Editor
3. Copy the contents of `MASTER-DATABASE-SETUP.sql`
4. Run the script

Alternatively, apply migrations:
```bash
npx supabase db push
```

#### 6. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Deployment Setup

For production deployment with managed services:

1.  **Choose the appropriate template:**

    **For free tier plans:**
    ```bash
    cp .env.free.template .env.local
    ```

    **For paid tier plans (higher performance limits):**
    ```bash
    cp .env.paid.template .env.local
    ```

2.  **Set up managed Supabase:**
    - Create a project at [supabase.com](https://supabase.com)
    - Get your project URL and keys from Project Settings → API
    - Run the `MASTER-DATABASE-SETUP.sql` script in the SQL Editor

3.  **Set up managed Qdrant:**
    - Create a cluster at [cloud.qdrant.io](https://cloud.qdrant.io)
    - Get your cluster URL and API key
    - Create a collection using the Qdrant dashboard or API

4.  Fill in all required environment variables in `.env.local`.

5.  When uploading documents, populate the metadata card for each file (law firm, fund manager, fund admin, jurisdiction).
    - Use the **Subscription Agreement Pages to Skip** inputs if you need to exclude a page range (e.g., 12–24).
    - Toggle **N/A** when there is no subscription agreement section; this keeps the full document.

### Authentication Setup

The application uses Supabase for authentication with different methods for local vs production:

**Local Development (localhost/127.0.0.1):**
- Email/password authentication enabled
- Google OAuth enabled
- Convenient for testing without OAuth provider setup

**Production Deployment:**
- Google OAuth only (more secure)
- Email/password form hidden automatically
- Configure Google OAuth in Supabase dashboard:
  1. Go to Authentication → Providers → Google
  2. Enable Google provider
  3. Add your production URL to Redirect URLs
  4. Configure Client ID and Secret from Google Cloud Console

### Upload Workflow

1. **Add files:** drag-and-drop or browse for PDFs (10 max per batch, 50&nbsp;MB each). Non-PDF files are rejected up front.  
2. **Validation:** every file runs through basic checks (page count, size, metadata completeness). Failed validations are flagged before upload.  
3. **Metadata form:** fill in law firm, fund manager, fund admin, jurisdiction, and optionally provide a subscription agreement skip range. When the range is supplied, those pages are removed before chunking; choosing “N/A” skips the exclusion.  
4. **Upload:** press “Upload” to send the files. The UI shows progress, and each file transitions through `pending → uploading → processing → completed/error`.  
5. **Storage & records:** every PDF is stored in Supabase Storage; a corresponding record is created in the `documents` table with the metadata payload.  
6. **Processing jobs:** each document queues a processing job unless the pipeline can start immediately (tiny documents on paid tiers). The cron endpoint is auto-triggered so background processing begins right away.  
7. **Status monitoring:** watch the dashboard, activity logs, or `GET /api/health/pool` for progress (connection pool usage, throttling limits, Qdrant cleanup queue depth). Failed uploads remain in the list with error messages; retry after addressing the issue.

### Environment Configuration

Three environment templates are provided for different deployment scenarios:

#### Local Development Template (`.env.dev.template`)
- **Use case:** Local development with Docker Supabase (bypasses VPN authentication issues)
- **Supabase:** Local instance at `http://127.0.0.1:54321`
- **Setup:**
  ```bash
  cp .env.dev.template .env.local
  npx supabase start  # Copy credentials from output
  npm run dev
  ```
- **Features:**
  - `NODE_TLS_REJECT_UNAUTHORIZED=0` for corporate VPN environments
  - Conservative limits for local testing (2 concurrent operations, 40 pool connections)
  - All other services (Google Cloud, Qdrant, Draftable) use managed instances

#### Free Tier Template (`.env.free.template`)
- **Use case:** Production deployment with free-tier managed services
- **Supabase:** Managed cloud instance
- **Configuration:**
  - Conservative connection pool (2-40 connections)
  - Limited concurrency (2 concurrent uploads/deletes)
  - Single document processing (`MAX_CONCURRENT_DOCUMENTS=1`)
  - Suitable for Supabase and Qdrant free plans

#### Paid Tier Template (`.env.paid.template`)
- **Use case:** Production deployment with paid-tier services for higher performance
- **Supabase:** Managed cloud instance
- **Configuration:**
  - Larger connection pool (20-200 connections)
  - Higher concurrency (5 concurrent operations)
  - Parallel document processing (`MAX_CONCURRENT_DOCUMENTS=10`)
  - Enhanced similarity workers (`SIMILARITY_STAGE2_WORKERS=8`)
  - Adjust limits further based on your service quotas

All templates include comprehensive inline documentation and consistent structure for easy maintenance.

## Operational Guardrails

- **Request throttling:** Uploads and deletes are limited by `UPLOAD_*` and `DELETE_*` environment variables. Free-tier defaults allow two concurrent operations globally and per user; paid tiers start at five.
- **Document AI queue:** Free-tier deployments process one document at a time (`MAX_CONCURRENT_DOCUMENTS=1`) so long PDFs stay within Supabase connection limits.
- **Qdrant cleanup worker:** Document deletions enqueue background vector cleanup with exponential backoff. Tune `QDRANT_DELETE_MAX_RETRIES` and `QDRANT_DELETE_BACKOFF_MS` as needed.
- **Health monitoring:** `GET /api/health/pool` reports Supabase pool metrics, throttling state, and Qdrant cleanup queue depth so you can keep an eye on resource pressure.
- **Similarity worker cap:** `SIMILARITY_STAGE2_WORKERS` controls how many Stage 2 scoring jobs can run in parallel (defaults to 1 for free tier); raise it alongside Supabase pool limits on higher plans.
- **Directional reuse metrics:** Stage 2 reports `sourceScore` / `targetScore` as the percentage of each document whose content appears in the other (based on character counts for accurate measurement).
- **Length ratio:** The similarity cards also display `Length Ratio`, which is the source document's character count divided by the target document's character count (e.g., `0.50` means the source is half the size of the target). This helps flag size mismatches even when reuse percentages are high.

### Similarity Search Pipeline

The production similarity endpoint (`/api/documents/[id]/similar-v2`) and the Selected Search flow share the same three-stage pipeline:

1. **Stage 0 – Centroid retrieval**
   - Uses the document centroid to gather up to `stage0_topK` (default 600) candidate documents from Qdrant.
   - Filters always include `user_id`; optional metadata filters and page ranges are applied here.

2. **Stage 1 – Chunk-level prefilter (optional)**  
   - Runs only when the Stage 0 candidate set exceeds `stage1_topK` (default 250).  
   - For each source chunk, performs a fast ANN search across candidate chunks to narrow the list.  
   - Skipped automatically when the candidate pool is already small.

3. **Stage 2 – Adaptive scoring with sections**
   - Fetches the full chunk sets for each candidate, respecting manual exclusions such as subscription agreement skip ranges.
   - Performs bidirectional matching with non-max suppression and minimum evidence thresholds.
   - Computes character-based scores using `computeAdaptiveScore`, returning:
     - `sourceScore`: fraction of source characters matched.
     - `targetScore`: fraction of target characters matched.
     - `matchedSourceCharacters` / `matchedTargetCharacters`.
     - `lengthRatio`: source characters ÷ target characters.
   - Groups matches into sections (page ranges) for easier inspection.

Results are sorted by `sourceScore`, then `targetScore`, then matched target characters, followed by upload date and title. General Search returns the default Top 30; Selected Search filters the candidate list to the user-chosen targets and highlights the new Length Ratio metric.

## Available Scripts

- `npm run dev`: Runs the development server.
- `npm run build`: Builds the application for production.
- `npm run start`: Starts the production server.
- `npm run lint`: Lints the code.
- `npm run type-check`: Runs the TypeScript compiler to check for type errors.

## Project Structure

```
.
├── src
│   ├── app
│   │   ├── api
│   │   ├── auth
│   │   ├── dashboard
│   │   ├── documents
│   │   └── login
│   ├── components
│   ├── hooks
│   ├── lib
│   └── types
├── public
├── scripts
└── ...
```

## Deployment

### Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

Check out the [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

### Docker

This project includes a `Dockerfile` and `docker-compose.yml` for building and running the application in a Docker container.

```bash
docker-compose up -d --build
```
