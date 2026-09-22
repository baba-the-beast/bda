#!/usr/bin/env python3
"""
Energy Analytics Platform - Unified Operator CLI.
Provides administrative, pipeline orchestration, and diagnostics commands
via direct API and platform interfaces.
"""

import os
import sys
import json
import time
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn

# Ensure root is in path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from shared.models import UserRole, JobType
from shared.repository import Repository
from shared.hdfs import get_hdfs_client
from shared.security import create_access_token

app = typer.Typer(help="Energy Analytics Big Data Platform CLI")
console = Console()
hdfs = get_hdfs_client()

# Sub-command groups
dataset_app = typer.Typer(help="Manage dataset ingestion and lifecycle")
mapreduce_app = typer.Typer(help="Execute and inspect MapReduce jobs")
hive_app = typer.Typer(help="Execute HiveQL analytical query templates")
stream_app = typer.Typer(help="Control real-time stream simulator")

app.add_typer(dataset_app, name="dataset")
app.add_typer(mapreduce_app, name="mapreduce")
app.add_typer(hive_app, name="hive")
app.add_typer(stream_app, name="stream")


# ---------------------------------------------------------------------------
# Diagnostics & Health
# ---------------------------------------------------------------------------

@app.command()
def health():
    """Verify platform health across services and storage."""
    table = Table(title="Platform Service Health", show_header=True, header_style="bold cyan")
    table.add_column("Component", style="dim")
    table.add_column("Type")
    table.add_column("Status")
    table.add_column("Details")

    # Storage Check
    hdfs_ok = os.path.exists(os.path.join(BASE_DIR, "data", "hdfs"))
    table.add_row("HDFS Storage", "Distributed FS", "[green]OPERATIONAL[/green]" if hdfs_ok else "[red]DEGRADED[/red]", "Path: /user/bda/energy")

    # Repository Check
    datasets = Repository.list_datasets()
    table.add_row("Metadata / Read-Model Store", "MongoDB", "[green]CONNECTED[/green]", f"{len(datasets)} datasets registered")

    # MapReduce Check
    from jobs.mapreduce.runner import JOB_REGISTRY
    table.add_row("Hadoop MapReduce", "Compute Engine", "[green]READY[/green]", f"{len(JOB_REGISTRY)} jobs registered (Daily, Hourly, Monthly, Peak)")

    # Hive Check
    from scripts.dev_server import hive_mod, stream_mod, prep_mod, dataset_mod
    table.add_row("Apache Hive", "SQL Analytics", "[green]READY[/green]", f"{len(hive_mod.APPROVED_TEMPLATES)} analytical templates ready")

    # Stream Check
    st = stream_mod.simulator_instance.get_status()
    stream_status = "[green]RUNNING[/green]" if st["is_running"] else "[yellow]IDLE[/yellow]"
    table.add_row("Stream Simulator", "Streaming Producer", stream_status, f"{st['total_events_emitted']} events emitted")

    console.print(table)


@app.command()
def diagnostics():
    """Display deep diagnostic information for BDA evaluation."""
    from scripts.dev_server import analytics_mod
    metrics = analytics_mod.get_bda_project_metrics()

    console.print(Panel.fit("[bold green]BDA Project Execution Metrics[/bold green]"))
    for k, v in metrics.items():
        console.print(f"[bold cyan]{k}:[/bold cyan] {v}")


# ---------------------------------------------------------------------------
# Dataset Commands
# ---------------------------------------------------------------------------

@dataset_app.command("import")
def dataset_import(file_path: str):
    """Import a local dataset into HDFS raw storage."""
    if not os.path.exists(file_path):
        console.print(f"[red]Error: File not found: {file_path}[/red]")
        raise typer.Exit(code=1)

    from scripts.dev_server import dataset_mod
    req = dataset_mod.LocalImportRequest(file_path=file_path)

    token = create_access_token("cli_admin", "admin@bda-energy.internal", UserRole.ADMIN)
    header_auth = f"Bearer {token}"

    with console.status("[bold green]Importing and uploading to HDFS raw storage...[/bold green]"):
        meta = dataset_mod.import_local_dataset(req, authorization=header_auth)

    console.print(f"[green]Dataset imported successfully![/green]")
    console.print(f"ID: [bold cyan]{meta.id}[/bold cyan]")
    console.print(f"SHA-256: [dim]{meta.checksum_sha256}[/dim]")
    console.print(f"HDFS Path: {meta.raw_hdfs_path}")


@dataset_app.command("list")
def dataset_list():
    """List all registered datasets."""
    datasets = Repository.list_datasets()
    table = Table(title="Registered Energy Datasets", show_header=True, header_style="bold magenta")
    table.add_column("Dataset ID")
    table.add_column("Filename")
    table.add_column("Status")
    table.add_column("Valid Rows")
    table.add_column("Rejected Rows")

    for ds in datasets:
        v_rows = ds.quality_report.valid_rows if ds.quality_report else "-"
        r_rows = ds.quality_report.rejected_rows if ds.quality_report else "-"
        table.add_row(ds.id, ds.filename, ds.status.value, str(v_rows), str(r_rows))

    console.print(table)


@dataset_app.command("preprocess")
def dataset_preprocess(dataset_id: str):
    """Run data validation and preprocessing on a dataset."""
    from scripts.dev_server import prep_mod

    token = create_access_token("cli_admin", "admin@bda-energy.internal", UserRole.ADMIN)
    header_auth = f"Bearer {token}"

    with console.status(f"[bold green]Preprocessing dataset {dataset_id}...[/bold green]"):
        report = prep_mod.trigger_preprocessing(dataset_id, authorization=header_auth)

    console.print(f"[green]Preprocessing finished successfully in {report.processing_duration_sec}s![/green]")
    console.print(f"Total Input: [cyan]{report.total_input_rows}[/cyan]")
    console.print(f"Valid Cleaned: [green]{report.valid_rows}[/green]")
    console.print(f"Missing Values ('?'): [yellow]{report.missing_value_rows}[/yellow]")
    console.print(f"Rejected Rows: [red]{report.rejected_rows}[/red]")
    console.print(f"Extreme Reading Candidates (>8kW): [magenta]{report.extreme_candidate_count}[/magenta]")


# ---------------------------------------------------------------------------
# MapReduce Commands
# ---------------------------------------------------------------------------

@mapreduce_app.command("run")
def mapreduce_run(job_type: str, dataset_id: str):
    """Execute a MapReduce job (DAILY, HOURLY, MONTHLY, or PEAK)."""
    from scripts.dev_server import job_mod
    from shared.models import AnalyticsJobCreate
    from fastapi import BackgroundTasks

    jt = job_type.upper()
    if jt not in ["DAILY", "HOURLY", "MONTHLY", "PEAK"]:
        console.print(f"[red]Invalid job type '{job_type}'. Must be DAILY, HOURLY, MONTHLY, or PEAK.[/red]")
        raise typer.Exit(code=1)

    token = create_access_token("cli_admin", "admin@bda-energy.internal", UserRole.ADMIN)
    header_auth = f"Bearer {token}"

    req = AnalyticsJobCreate(dataset_id=dataset_id, job_type=JobType(jt))
    bg = BackgroundTasks()

    job = job_mod.create_job(req, bg, authorization=header_auth)
    console.print(f"[green]Submitted MapReduce {jt} job: [bold cyan]{job.id}[/bold cyan][/green]")

    # Poll status until complete
    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), transient=True) as progress:
        task = progress.add_task(f"Executing {jt} MapReduce job...", total=None)
        while True:
            cur = Repository.get_job(job.id)
            if cur.status.value in ("SUCCEEDED", "FAILED", "CANCELLED"):
                break
            time.sleep(0.5)

    final_job = Repository.get_job(job.id)
    if final_job.status.value == "SUCCEEDED":
        console.print(f"[bold green]Job {final_job.id} SUCCEEDED in {final_job.duration_seconds}s![/bold green]")
    else:
        console.print(f"[bold red]Job {final_job.id} FAILED: {final_job.error_message}[/bold red]")


# ---------------------------------------------------------------------------
# Hive Commands
# ---------------------------------------------------------------------------

@hive_app.command("query")
def hive_query(template_name: str, dataset_id: str, limit: int = 10):
    """Execute an approved HiveQL analytical query."""
    from scripts.dev_server import hive_mod

    token = create_access_token("cli_admin", "admin@bda-energy.internal", UserRole.ADMIN)
    header_auth = f"Bearer {token}"

    req = hive_mod.QueryExecutionRequest(dataset_id=dataset_id, template_name=template_name, parameters={"limit": limit})
    with console.status(f"[bold green]Executing HiveQL template '{template_name}'...[/bold green]"):
        resp = hive_mod.execute_query(req, authorization=header_auth)

    table = Table(title=f"HiveQL Results: {template_name} ({resp.row_count} rows in {resp.execution_duration_sec}s)")
    for col in resp.columns:
        table.add_column(col)

    for row in resp.results[:limit]:
        table.add_row(*[str(row.get(c, "")) for c in resp.columns])

    console.print(table)


# ---------------------------------------------------------------------------
# Stream Commands
# ---------------------------------------------------------------------------

@stream_app.command("start")
def stream_start(dataset_id: str, rate: int = 5):
    """Start real-time smart meter stream simulation."""
    from scripts.dev_server import stream_mod
    stream_mod.simulator_instance.start(dataset_id, events_per_sec=rate)
    console.print(f"[green]Stream simulator started for {dataset_id} at {rate} records/second.[/green]")


@stream_app.command("stop")
def stream_stop():
    """Stop stream simulator."""
    from scripts.dev_server import stream_mod
    stream_mod.simulator_instance.stop()
    console.print("[yellow]Stream simulator stopped.[/yellow]")


@stream_app.command("status")
def stream_status():
    """Get stream simulator status."""
    from scripts.dev_server import stream_mod
    st = stream_mod.simulator_instance.get_status()
    console.print_json(data=st)


if __name__ == "__main__":
    app()
