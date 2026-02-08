# DHL Asset Report Generator - Setup Guide

Complete setup instructions for Linux and Windows machines.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Python | 3.10+ | Required for backend |
| Node.js | 18+ | Required for frontend |
| Git | Any | To clone the repository |
| Docker | Optional | For containerized deployment |

---

## Quick Start (Docker)

The fastest way to get running.

### Linux
```bash
git clone https://github.com/stvlley/DHL-Asset-Report-Generator.git
cd DHL-Asset-Report-Generator
cp .env.example .env
# Edit .env with your settings (see Environment Variables section)
docker-compose up -d
```

### Windows (PowerShell)
```powershell
git clone https://github.com/stvlley/DHL-Asset-Report-Generator.git
cd DHL-Asset-Report-Generator
copy .env.example .env
# Edit .env with your settings (see Environment Variables section)
docker-compose up -d
```

**Access:**
- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/api/docs
- Health Check: http://localhost:8000/health

---

## Manual Setup - Linux

### 1. Clone Repository
```bash
git clone https://github.com/stvlley/DHL-Asset-Report-Generator.git
cd DHL-Asset-Report-Generator
```

### 2. Backend Setup
```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start backend server
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend Setup (new terminal)
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### 4. Access Application
- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/api/docs

---

## Manual Setup - Windows

### 1. Clone Repository
```cmd
git clone https://github.com/stvlley/DHL-Asset-Report-Generator.git
cd DHL-Asset-Report-Generator
```

### 2. Backend Setup (Command Prompt)
```cmd
cd backend

:: Create virtual environment
python -m venv venv
venv\Scripts\activate

:: Install dependencies
pip install -r requirements.txt

:: Start backend server
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Backend Setup (PowerShell)
```powershell
cd backend

# Create virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Start backend server
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend Setup (new terminal)
```cmd
cd frontend

:: Install dependencies
npm install

:: Start development server
npm run dev
```

### 4. Access Application
- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/api/docs

---

## Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```env
# Database (PostgreSQL for production)
DATABASE_URL=sqlite:///./dhl_assets.db
# DATABASE_URL=postgresql://user:password@localhost:5432/dhl_assets

# Security (CHANGE IN PRODUCTION)
SECRET_KEY=your-256-bit-secret-key-here

# Debug mode
DEBUG=true

# PostgreSQL settings (Docker only)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=dhl_assets
```

---

## Database Initialization

The database initializes automatically on first run. If you encounter column errors (especially with MDM features), run this migration:

### Linux
```bash
cd backend
source venv/bin/activate
python3 -c "
from app.core.database import engine, Base
from app.models.asset import AssetMaster
Base.metadata.create_all(bind=engine, tables=[AssetMaster.__table__])
print('Database tables created!')
"
```

### Windows
```cmd
cd backend
venv\Scripts\activate
python -c "from app.core.database import engine, Base; from app.models.asset import AssetMaster; Base.metadata.create_all(bind=engine, tables=[AssetMaster.__table__]); print('Database tables created!')"
```

### Adding Missing Columns (if upgrading)

If you have an existing database and get "no such column" errors:

```bash
cd backend
python3 -c "
import sqlite3
conn = sqlite3.connect('dhl_assets.db')
c = conn.cursor()
cols = [
    'hsn VARCHAR(50)', 'mac_address VARCHAR(50)', 'imei VARCHAR(20)',
    'mdm_device_id VARCHAR(100)', 'manufacturer VARCHAR(100)',
    'source VARCHAR(20)', 'it_allocation_snapshot_id VARCHAR(36)',
    'mdm_enrollment_status VARCHAR(20)', 'mdm_last_seen DATETIME',
    'mdm_last_sync DATETIME', 'mdm_days_since_connect INTEGER',
    'mdm_os_version VARCHAR(50)', 'mdm_agent_version VARCHAR(50)',
    'mdm_battery_level INTEGER', 'mdm_compliance_status VARCHAR(50)',
    'mdm_device_name VARCHAR(100)', 'mdm_raw_data TEXT',
    'previous_site_code VARCHAR(20)', 'transfer_date DATETIME',
    'transfer_notes TEXT', 'notes TEXT'
]
for col in cols:
    try:
        c.execute(f'ALTER TABLE assets_master ADD COLUMN {col}')
        print(f'Added: {col.split()[0]}')
    except: pass
conn.commit()
print('Migration complete!')
"
```

### Creating Scan Audit Tables (for real-time scanning)

If you get "no such table: scan_sessions" errors:

```bash
cd backend
source venv/bin/activate  # Linux
# Or: venv\Scripts\activate  # Windows

python -c "
from app.core.database import engine, Base
from app.models.scan_audit import ScanSession, ScanResult
Base.metadata.create_all(bind=engine, tables=[ScanSession.__table__, ScanResult.__table__])
print('Scan audit tables created!')
"
```

---

## Default Login

After first run, create an admin user or use:

```
Email: admin@dhl.com
Password: (check seed data or create via API)
```

---

## Project Structure

```
DHL-Asset-Report-Generator/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/    # API routes
│   │   ├── core/                # Config, database, security
│   │   ├── models/              # SQLAlchemy models
│   │   ├── schemas/             # Pydantic schemas
│   │   └── services/            # Business logic
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/          # React components
│   │   ├── pages/               # Page components
│   │   ├── services/            # API client
│   │   └── hooks/               # Custom hooks
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── SETUP.md
```

---

## Verification

### Backend Health Check
```bash
curl http://localhost:8000/health
# Should return: {"status": "healthy", ...}
```

### Frontend
Open http://localhost:3000 in browser - should see login page.

### API Documentation
Open http://localhost:8000/api/docs for Swagger UI.

---

## Troubleshooting

### "No such column" errors
Run the database migration script above.

### "Could not validate credentials"
- Clear browser cache/cookies
- Log out and log back in
- Restart the backend server

### Port already in use
```bash
# Linux - find and kill process on port 8000
lsof -i :8000
kill -9 <PID>

# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### Python virtual environment issues (Windows)
If PowerShell blocks script execution:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Node modules issues
```bash
rm -rf node_modules package-lock.json
npm install
```

---

## Production Deployment

For production, use Docker Compose with PostgreSQL:

```bash
# Set production environment variables
export DATABASE_URL=postgresql://user:pass@db:5432/dhl_assets
export SECRET_KEY=$(openssl rand -hex 32)
export DEBUG=false

# Run with Docker
docker-compose up -d
```

---

## Support

- Issues: https://github.com/stvlley/DHL-Asset-Report-Generator/issues
- Documentation: See `/api/docs` endpoint for API reference
