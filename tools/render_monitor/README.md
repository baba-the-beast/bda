# Render Keep-Alive Monitor

A small, standalone process that sends a `GET` to the deployed backend's
health endpoint on a fixed interval and logs whether it answered.

- **Target:** `${RENDER_URL}/health`. The backend (`scripts/dev_server.py`) already
  serves it, and `render.yaml` uses the same path for Render's own health check.
  It returns `{"status": "UP", ...}`, and no application code was changed.
- **Dependencies:** none. It uses only the Python 3.11+ standard library, so it runs on
  any machine with Python and doesn't need the app's `requirements.txt`.
- **Isolation:** nothing in the app imports it, and it has no effect on the build,
  Docker images, Render blueprint or Vercel frontend.

## Why it exists

The API runs on Render's free web-service plan, which spins a service down
after about 15 minutes without inbound traffic. The first request after that
waits for a cold start of up to a minute. The monitor gives you:

1. **Reachability monitoring:** a log line per check with status and response
   time, plus uptime statistics.
2. **Fewer cold starts:** during the hours it runs, a check every 10 minutes counts
   as inbound traffic, so the service is usually awake when a real user arrives.

It does nothing beyond ordinary, rate-limited HTTP requests to a public endpoint.
It doesn't work around Render's quotas, billing, or anti-abuse rules (see
[Limitations](#limitations)).

## Run it independently, never on the Render service itself

The monitor **must not** run inside the Render service it watches:

- A service pinging itself doesn't count as outside traffic. Once Render
  spins it down, the pinger is asleep too, so nothing can wake it.
- It adds a second long-running loop to a 512 MB instance for no benefit.

As a guard, if the monitor detects that it's running on Render and that `RENDER_URL`
is that same service (Render sets `RENDER_EXTERNAL_URL`), it refuses to start.

Good places to run it: your own machine, any always-on VPS or home server, a
container host, or a scheduled job on another platform (see below).

## Configure

All configuration comes from environment variables. You can also put them in
`tools/render_monitor/.env`, which is git-ignored. Real environment variables win
over the file. The monitor needs no secrets.

```bash
cp tools/render_monitor/.env.example tools/render_monitor/.env
# then edit RENDER_URL
```

| Variable | Default | Meaning |
|---|---|---|
| `RENDER_URL` | **required** | Public URL of the backend, e.g. `https://bda-backend-api.onrender.com` |
| `HEALTH_PATH` | `/health` | Endpoint appended to `RENDER_URL` |
| `PING_INTERVAL_MINUTES` | `10` | Minutes between checks (1–1440). The monitor warns at 15 or more, because that won't prevent idling |
| `REQUEST_TIMEOUT_SECONDS` | `30` | Per-request timeout (1–300) |
| `MAX_RETRIES` | `2` | Extra attempts after a timeout, network error, 5xx or 429 (0–5). Other 4xx are not retried |
| `RETRY_BACKOFF_SECONDS` | `2` | First retry delay. It doubles each retry (2s, 4s, …) |
| `STATS_EVERY_N_CHECKS` | `6` | Log a stats summary every N checks (0 = only on shutdown) |
| `STATUS_PORT` | *(off)* | If set, serves `GET /status` with the statistics as JSON |
| `STATUS_HOST` | `127.0.0.1` | Bind address for the status endpoint |
| `LOG_FORMAT` | `text` | `text` or `json` (one object per line) |

`RENDER_URL` must be an absolute `http(s)` URL with no credentials, query
string or fragment. Invalid values exit immediately with code 2 and a message.

### Setting the Render URL after deployment

1. Deploy the backend using the steps in `docs/DEPLOYMENT.md` §6.2.
2. In the Render dashboard, open the `bda-backend-api` service. The URL is shown
   under the service name, e.g. `https://bda-backend-api.onrender.com`.
3. Check it by hand: `curl https://bda-backend-api.onrender.com/health`.
4. Set `RENDER_URL` to that URL, **without** `/health`, in the monitor's
   environment or `.env`.

To change the interval, set `PING_INTERVAL_MINUTES` (e.g. `14`) and restart
the monitor.

## Run

From the repository root:

```bash
# Continuous monitoring; Ctrl+C (SIGINT) or SIGTERM stops it cleanly
python tools/render_monitor/monitor.py
make keepalive                          # same thing

# One check, then exit: 0 = reachable, 1 = failed, 2 = bad config
python tools/render_monitor/monitor.py --once

# Inline configuration instead of a .env file
RENDER_URL=https://bda-backend-api.onrender.com PING_INTERVAL_MINUTES=10 \
  python tools/render_monitor/monitor.py
```

Windows PowerShell:

```powershell
$env:RENDER_URL = "https://bda-backend-api.onrender.com"
python tools/render_monitor/monitor.py
```

### Docker

The image is separate from the application images and holds only `monitor.py`:

```bash
docker build -f tools/render_monitor/Dockerfile -t bda-render-monitor .
docker run -d --name render-monitor --restart unless-stopped \
  -e RENDER_URL=https://bda-backend-api.onrender.com bda-render-monitor
docker logs -f render-monitor
docker stop render-monitor              # SIGTERM → graceful exit
```

To see live statistics from the host, add `-e STATUS_PORT=8099 -p 127.0.0.1:8099:8099`
and open `http://127.0.0.1:8099/status`. The image sets `STATUS_HOST=0.0.0.0`
so the port is reachable from outside the container, and the `127.0.0.1:` prefix
on `-p` keeps it off the host's public interfaces.

It isn't part of `docker-compose.yml` on purpose: that file runs the
application stack, and the monitor belongs on a different host.

### Scheduled one-shot checks (cron / CI)

If you have no always-on machine, `--once` fits any scheduler:

```cron
*/10 * * * * cd /path/to/bda && RENDER_URL=https://bda-backend-api.onrender.com python3 tools/render_monitor/monitor.py --once >> /var/log/render-monitor.log 2>&1
```

A GitHub Actions workflow can do the same (`on: schedule: - cron: '*/10 * * * *'`,
then run the `--once` command with `RENDER_URL` from a repository variable). GitHub
runs scheduled workflows on a best-effort basis: runs are often late, sometimes skipped,
and automatically disabled after 60 days without repository activity. Treat it
as monitoring, not a guarantee that the service stays awake. Each run is a
fresh process, so the uptime statistics cover one check only.

## Reading the logs

Each check produces one line (`text` format):

```
[2026-09-28 12:00:00 UTC] health_check started url=https://bda-backend-api.onrender.com endpoint=/health interval_min=10.0 timeout_s=30.0
[2026-09-28 12:00:01 UTC] health_check ok url=https://bda-backend-api.onrender.com endpoint=/health status=200 response_ms=842 attempts=1
[2026-09-28 12:10:31 UTC] health_check attempt_failed url=... endpoint=/health response_ms=30001 attempt=1 error="Connection timeout after 30s" retry_in_s=2.0
[2026-09-28 12:11:05 UTC] health_check ok url=... endpoint=/health status=200 response_ms=31950 attempts=2
[2026-09-28 13:00:00 UTC] health_check FAILED url=... endpoint=/health status=503 response_ms=95 attempts=3 error="HTTP 503"
[2026-09-28 13:00:00 UTC] health_check stats url=... endpoint=/health started_at=... total_checks=6 successful_checks=5 failed_checks=1 last_success=... last_failure=... avg_response_ms=6120 uptime_percent=83.33
```

| Event | Meaning |
|---|---|
| `ok` | 2xx response. `response_ms` is the final attempt's time; `attempts > 1` means it recovered after retrying |
| `attempt_failed` | One attempt failed and a retry is scheduled (WARNING) |
| `FAILED` | Every attempt failed. `status` is present for HTTP errors and absent for timeouts and connection errors (ERROR) |
| `stats` | Running totals since the monitor started |
| `interrupted` | Shutdown arrived during a retry wait; the check isn't counted in the statistics |
| `started` / `stopped` | Lifecycle |

A slow `ok` (tens of seconds) right after a timeout means the service was
asleep and has just cold-started. Repeated `FAILED` with `status=404` usually
means `RENDER_URL` or `HEALTH_PATH` is wrong. A 404 is not retried.

The logs contain only the target URL, endpoint, status, timing and error
text. The monitor sends no auth headers or cookies and reads no
application secrets. `RENDER_URL` itself is rejected if it contains credentials.

Set `STATUS_PORT=8099` to get live statistics at `http://127.0.0.1:8099/status`.

## Limitations

These describe Render's free plan at the time of writing. Check
<https://render.com/docs/free> for current terms, and follow them if they
differ.

- **Pings use free instance hours.** Free web services draw from a monthly
  allowance of instance hours per workspace (750 at the time of writing). Keeping
  one service awake around the clock uses most of it, and a second always-awake
  free service would run out before the month ends. Once the hours are used,
  Render suspends free services until the next month. The monitor doesn't try to
  avoid this.
- **No guarantee of staying awake.** Render decides when to spin a service
  down and may change its rules. If pings no longer keep a free service awake,
  the monitor still reports reachability and records the cold starts. The
  reliable fix is a paid instance type, not a more aggressive interval.
- **Restarts still happen.** Deploys, platform maintenance and crashes restart
  the instance whatever the traffic. On this project that also wipes the ephemeral
  disk (`LOCAL_HDFS_ROOT`: uploaded datasets and job outputs), as described in
  `docs/DEPLOYMENT.md` §6.5. Keep-alive pings can't prevent that.
- **It only watches the API.** The frontend is on Vercel, which doesn't sleep,
  so it isn't a target.
- **`/health` is shallow.** It confirms the process is serving HTTP, not that
  MongoDB is reachable. A 200 doesn't prove every feature works.
- **A wrong `HEALTH_PATH` can still return 200.** If the backend was built with
  `frontend/dist` present, its SPA catch-all answers unknown paths with
  `index.html`. The Render build (`pip install` only) has no `frontend/dist`, so
  there a typo returns 404. Keep `HEALTH_PATH=/health` unless you know otherwise.

## Tests

```bash
pytest tests/unit/test_render_monitor.py -v
```

These cover config loading and validation, invalid URLs, success, HTTP failure,
timeout, connection refusal, retry and exponential backoff, the status endpoint,
secret-free logging, and graceful shutdown (SIGINT/SIGTERM handlers,
stopping mid-interval and mid-backoff).
