# DHL Asset Audit Reconciliation Tool

A web application for DHL Supply Chain distribution centers to upload monthly physical asset audits and receive automated variance analysis against corporate master data.

## Features

- **Physical Audit Upload**: Upload Excel/CSV files with physical audit data
- **Automated Reconciliation**: Compare physical audits against master data
- **Variance Detection**: Identify CORRECT, MISSING, MISALLOCATED, and UNTRACKED assets
- **Action Item Generation**: Pre-filled email templates for GL corrections
- **Portfolio Dashboard**: Multi-site visibility with GL accuracy metrics
- **Cost Savings Identification**: Highlight potential monthly savings from GL corrections

## Quick Start

### Using Docker (Recommended)

1. Clone the repository and copy environment file:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. Start all services:
   ```bash
   docker-compose up -d
   ```

3. Access the application:
   - Frontend: http://localhost:3000
   - API Docs: http://localhost:8000/api/docs

### Manual Development Setup

#### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              React Frontend (TypeScript)                 │
│  - Dashboard, Upload, Audit Results, Master Data        │
└──────────────────────────┬──────────────────────────────┘
                           │ REST API
┌──────────────────────────┴──────────────────────────────┐
│               FastAPI Backend (Python)                   │
│  - Authentication, Reconciliation Engine, Reports        │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────┐
│                    PostgreSQL Database                   │
└──────────────────────────────────────────────────────────┘
```

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc

## Key Technologies

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy 2.0, PostgreSQL
- **Frontend**: React 18, TypeScript, Tailwind CSS, TanStack Query
- **Infrastructure**: Docker, Nginx

## Critical Design Decisions

1. **Physical audit is source of truth** - The system identifies what needs to change in corporate records to match reality

2. **Duplicate serial handling** - Flags duplicates instead of rejecting them, with warnings

3. **Soft delete for master data** - Preserves audit history

4. **8-hour access tokens with refresh** - Balance of security and usability

## License

Proprietary - DHL Supply Chain Internal Use Only
