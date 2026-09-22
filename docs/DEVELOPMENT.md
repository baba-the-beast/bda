# Local Development & Engineering Guide

## 1. Prerequisites & Environment Setup

To develop and test the Big Data Energy Consumption Analytics Platform locally, ensure the following tooling is installed:

- **Python**: 3.11+ (Python 3.11, 3.12, 3.13, 3.14 supported)
- **Node.js**: 18.x or 20.x LTS + `npm` 9+
- **Docker & Docker Compose**: (Optional for local container testing)
- **Git**: For version control

### 1.1 Python Virtual Environment
```bash
# Clone or navigate to the repository root
cd d:/bda

# Create and activate virtual environment
python -m venv venv
# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# On Linux/macOS:
source venv/bin/activate

# Install core dependencies
pip install -r requirements.txt
```

---

## 2. Generating Sample Data & Testing Datasets

If you do not have the complete 2.07M-row UCI dataset archive, generate realistic synthetic power telemetry:

```bash
# Generates 20,160 rows (~2 weeks) of 1-minute smart meter readings with realistic diurnal patterns
python scripts/generate_sample_data.py --output data/sample_data.txt --days 14
```

To download and verify the official UCI dataset archive (~133 MB compressed):
```bash
python scripts/download_uci_dataset.py --output data/household_power_consumption.txt
```

---

## 3. Running the Unified Local Development Server

To avoid running 8 separate background Python processes during development, use the unified orchestrator which mounts all 42 microservice routes onto port `8000`:

```bash
# Starts API Gateway and all microservices on http://localhost:8000
python scripts/dev_server.py
```

Swagger / OpenAPI documentation is immediately available at:
- **Interactive API Docs**: `http://localhost:8000/docs`
- **OpenAPI JSON Spec**: `http://localhost:8000/openapi.json`
- **Health Check**: `http://localhost:8000/health`

Default Seeding Credentials:
- **Admin**: `admin@bda-energy.internal` / `AdminPass123!` (Role: `ADMIN`)
- **Analyst**: `analyst@bda-energy.internal` / `AnalystPass123!` (Role: `ANALYST`)

---

## 4. Running the Frontend Development Server

The single-page application is built with React 18, Vite, and TailwindCSS:

```bash
cd frontend
npm install
npm run dev
```

The web dashboard is now accessible at `http://localhost:5173`.
To build the production bundle:
```bash
npm run build
```

---

## 5. Command-Line Interface (CLI)

The platform provides a first-class CLI for batch automation and data engineering:

```bash
# Windows wrapper
energy.bat --help

# Direct Python entrypoint
python cli/main.py --help
```

### CLI Command Examples:
```bash
# Check cluster health
energy health

# Run platform diagnostics
energy diagnostics

# Import and preprocess dataset
energy dataset import data/sample_data.txt
energy dataset preprocess ds-sample-1234

# Dispatch MapReduce batch jobs
energy mapreduce run ds-sample-1234 --job daily
energy mapreduce run ds-sample-1234 --job hourly
energy mapreduce run ds-sample-1234 --job peak --threshold 5.0

# Execute Hive analytical queries
energy hive query ds-sample-1234 --template daily_aggregates --limit 10

# Control real-time streaming replayer
energy stream start --interval 100
energy stream status
energy stream stop
```

---

## 6. Running Automated Tests

```bash
# Run all unit, integration, and security tests
pytest tests/ -v

# Run with test coverage report
pytest tests/ --cov=shared --cov=services -v

# Run specific test suites
pytest tests/unit/ -v
pytest tests/integration/ -v
pytest tests/security/ -v
```

---

## 7. Analytical Correctness & Math Verification

To independently verify calculation parity across Local Math, Hadoop MapReduce, and HiveQL (Requirement 50):

```bash
python tests/correctness/verify_analytics.py
```

This verification script runs all 3 execution paths on sample data and verifies that daily totals, averages, and sub-meter Wh match within IEEE 754 floating-point tolerances ($\Delta \le 0.0005$).
