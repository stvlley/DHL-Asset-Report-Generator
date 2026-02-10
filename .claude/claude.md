# DHL Asset Audit & Reconciliation Tool

## Core Principle

**IMPORTANT**: Physical audit is the source of truth - GL records are corrected to match reality, not the other way around.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy 2.0 + PostgreSQL/SQLite
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **State**: Zustand (auth), TanStack Query (server state)

## Commands & Validation

### Development
```bash
# Backend - ALWAYS activate venv first
cd backend && source venv/bin/activate
python -m uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev
```

### Validation Steps - RUN AFTER EVERY CHANGE

```bash
# Backend validation
cd backend && source venv/bin/activate
python -m py_compile app/main.py          # Syntax check
python -c "from app.main import app"       # Import check

# Frontend validation
cd frontend
npm run build                              # TypeScript + build check
npm run lint                               # Linting
```

### Docker
```bash
docker-compose up -d
docker-compose logs -f backend   # Check for errors
curl http://localhost:8000/health  # Verify API
```

## Critical Conventions

### Backend (Python)
- **NEVER hard delete assets** - always use `is_deleted = True` flag
- **ALWAYS use `Depends(get_db)`** for database session injection
- Business logic goes in `services/`, keep route handlers thin
- All request/response must have Pydantic schemas

### Frontend (TypeScript)
- Use axios client from `services/api.ts` - it handles token refresh
- Forms: react-hook-form + Zod validation (see existing patterns)
- Use `cn()` from `lib/utils.ts` for conditional Tailwind classes

### DHL Brand Colors
- Yellow: `#FFCC00` | Red: `#D40511`

## Database

### Composite Primary Key
**IMPORTANT**: `assets_master` uses composite key: `(serial_number, assigned_site_code)`

### Asset Identifiers (check all when searching)
- `serial_number` (primary)
- `hsn` (Hardware Serial Number)
- `mac_address`
- `imei`
- `mdm_device_id`

### Schema Changes
```bash
# After model changes, reset SQLite dev DB:
rm backend/dhl_assets.db
# Restart backend - auto-creates with seed data
```

## Adding Features

### New Backend Endpoint
1. Schema in `backend/app/schemas/`
2. Service method in `backend/app/services/`
3. Route in `backend/app/api/v1/endpoints/`
4. Register in `backend/app/api/v1/api.py`
5. **VALIDATE**: `python -c "from app.main import app"`

### New Frontend Page
1. Page component in `frontend/src/pages/`
2. Route in `frontend/src/App.tsx`
3. Nav link in `frontend/src/components/Layout.tsx`
4. **VALIDATE**: `npm run build`

## Reconciliation Domain Knowledge

### Variance Types
| Type | Meaning |
|------|---------|
| `CORRECT` | Asset found where expected |
| `MISALLOCATED` | Asset found but wrong site in GL |
| `UNTRACKED` | Asset found but not in GL master |
| `MISSING` | Asset in GL but not found in audit |
| `CONDITION_MISMATCH` | Asset condition differs from record |

### Action Categories
`REMOVAL` | `TRANSFER` | `ADDITION` | `CONDITION` | `MDM`

## Common Gotchas

1. **Duplicate serials**: System flags with `is_duplicate=True` instead of rejecting - handle gracefully
2. **SQLite vs PostgreSQL**: Dev uses SQLite, production uses PostgreSQL - connection pooling differs
3. **Token refresh**: Frontend axios interceptor auto-refreshes tokens - don't manually handle 401s in components
4. **File uploads**: Max 10MB, allowed types: `.xlsx`, `.xls`, `.csv`
5. **Account lockout**: 5 failed attempts = 15-minute lockout (check `failed_login_attempts` field)
6. **Soft deletes**: Query with `.filter(Asset.is_deleted == False)` to exclude deleted records

## Security Constraints

- Access tokens: 8-hour expiry
- Refresh tokens: 7-day expiry
- Password: 12+ chars, upper/lower, digit, special char
- Roles: `Admin`, `Site Operations`, `Site Manager`, `Regional Director`

## Key Files

| File | Purpose |
|------|---------|
| `backend/app/services/reconciliation.py` | Core reconciliation logic |
| `backend/app/services/master_data.py` | Asset CRUD with soft delete |
| `backend/app/services/file_service.py` | Excel/CSV parsing |
| `backend/app/core/database.py` | DB connection setup |
| `frontend/src/services/api.ts` | Axios with token refresh |
| `frontend/src/hooks/useAuthStore.ts` | Auth state (Zustand) |

## Environment Variables

```bash
DATABASE_URL=sqlite:///./dhl_assets.db  # Dev
# DATABASE_URL=postgresql://user:pass@host/db  # Prod
SECRET_KEY=change-me-in-production      # MUST change for prod
DEBUG=true                               # false in prod
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

## Pre-Commit Checklist

Before committing changes, verify:

- [ ] Backend syntax: `python -c "from app.main import app"`
- [ ] Frontend builds: `cd frontend && npm run build`
- [ ] No hardcoded secrets or credentials
- [ ] Soft delete used (not hard delete) for asset operations
- [ ] Pydantic schemas for new endpoints
- [ ] API follows existing patterns in `/api/v1/endpoints/`
