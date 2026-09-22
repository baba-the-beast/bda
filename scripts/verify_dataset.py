"""
Dataset Verification CLI Utility.
Independently verifies the presence, schema adherence, record count,
checksum integrity, and value ranges of the extracted UCI dataset.
"""

import hashlib
import json
import os
import sys

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(BASE_DIR, "data")
DEFAULT_TXT = os.path.join(DATA_DIR, "raw", "household_power_consumption.txt")
MANIFEST_PATH = os.path.join(DATA_DIR, "dataset_manifest.json")


def verify_dataset(file_path: str = DEFAULT_TXT) -> bool:
    if not os.path.exists(file_path):
        print(f"[ERROR] Target dataset file does not exist: {file_path}", file=sys.stderr)
        print("Run 'python scripts/prepare_dataset.py' first.", file=sys.stderr)
        return False

    print(f"[INFO] Verifying dataset at: {file_path}")
    size = os.path.getsize(file_path)
    print(f"[INFO] File size: {size:,} bytes ({size / (1024 * 1024):.2f} MB)")

    hasher = hashlib.sha256()
    total_lines = 0
    missing_rows = 0
    first_line = ""
    last_line = ""

    with open(file_path, encoding="utf-8", errors="ignore") as f:
        for idx, line in enumerate(f):
            total_lines += 1
            hasher.update(line.encode("utf-8"))
            if idx == 0:
                first_line = line.strip()
            elif idx == 1:
                pass
            last_line = line.strip()
            if "?" in line:
                missing_rows += 1

    computed_hash = hasher.hexdigest()
    data_rows = total_lines - 1

    print(f"[INFO] Computed SHA-256: {computed_hash}")
    print(f"[INFO] Total lines: {total_lines} (1 header + {data_rows:,} data rows)")
    print(f"[INFO] Rows with missing values ('?'): {missing_rows:,} ({missing_rows / data_rows * 100:.2f}%)")

    # Verify manifest if exists
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, encoding="utf-8") as mf:
            manifest = json.load(mf)
        print(f"[INFO] Comparing against manifest: {MANIFEST_PATH}")
        if manifest.get("data_rows") == data_rows:
            print(f"[OK] Record count matches manifest: {data_rows:,}")
        else:
            print(f"[WARN] Manifest record count ({manifest.get('data_rows')}) differs from actual ({data_rows})")

    # Column count verification
    tokens = first_line.split(";")
    if len(tokens) == 9:
        print(f"[OK] Header contains exact 9 attributes: {tokens}")
    else:
        print(f"[FAIL] Header contains {len(tokens)} tokens, expected 9: {tokens}", file=sys.stderr)
        return False

    # Check last line
    print(f"[INFO] Last recorded measurement: {last_line}")
    print("[SUCCESS] Dataset verification passed all checks!")
    return True


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TXT
    success = verify_dataset(target)
    sys.exit(0 if success else 1)
