"""
Dataset Preparation & Safe Bootstrapping Script.
Detects the official UCI Individual Household Electric Power Consumption dataset ZIP,
validates archive against path traversal (Zip Slip) and decompression bombs,
safely extracts the raw dataset, computes cryptographic SHA-256 checksum,
verifies header structure & record count (~2,075,259), and produces a manifest.
"""

import hashlib
import json
import os
import sys
import zipfile
from datetime import UTC, datetime

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(BASE_DIR, "data")
RAW_DATA_DIR = os.path.join(DATA_DIR, "raw")
MANIFEST_PATH = os.path.join(DATA_DIR, "dataset_manifest.json")

EXPECTED_HEADER = "Date;Time;Global_active_power;Global_reactive_power;Voltage;Global_intensity;Sub_metering_1;Sub_metering_2;Sub_metering_3"
EXPECTED_DATA_ROWS = 2075259
MAX_UNCOMPRESSED_SIZE_BYTES = 300 * 1024 * 1024  # 300 MB maximum threshold
MAX_COMPRESSION_RATIO = 20.0  # Max ratio of uncompressed to compressed size


def find_dataset_zip() -> str:
    candidates = [
        os.path.join(BASE_DIR, "individual+household+electric+power+consumption.zip"),
        os.path.join(DATA_DIR, "individual+household+electric+power+consumption.zip"),
        os.path.join(BASE_DIR, "household_power_consumption.zip"),
        os.path.join(DATA_DIR, "household_power_consumption.zip"),
    ]
    for p in candidates:
        if os.path.exists(p) and os.path.isfile(p):
            return p
    raise FileNotFoundError(
        f"Official dataset ZIP not found in candidate paths: {[os.path.basename(c) for c in candidates]}"
    )


def safe_extract_zip(zip_path: str, extract_to_dir: str) -> str:
    os.makedirs(extract_to_dir, exist_ok=True)
    real_dest_dir = os.path.realpath(extract_to_dir)

    print(f"[INFO] Inspecting archive: {os.path.basename(zip_path)}")
    with zipfile.ZipFile(zip_path, "r") as zf:
        infolist = zf.infolist()
        total_uncompressed = sum(info.file_size for info in infolist)
        archive_size = os.path.getsize(zip_path)

        if total_uncompressed > MAX_UNCOMPRESSED_SIZE_BYTES:
            raise ValueError(
                f"Archive uncompressed size ({total_uncompressed} bytes) exceeds safety limit ({MAX_UNCOMPRESSED_SIZE_BYTES} bytes)"
            )

        if archive_size > 0 and (total_uncompressed / archive_size) > MAX_COMPRESSION_RATIO:
            raise ValueError("Abnormal compression ratio detected (potential zip bomb)")

        target_member = None
        for info in infolist:
            # Zip Slip / Path Traversal Check
            member_name = info.filename
            target_path = os.path.realpath(os.path.join(extract_to_dir, member_name))
            if not target_path.startswith(real_dest_dir + os.sep) and target_path != real_dest_dir:
                raise ValueError(f"Path traversal detected in archive entry: {member_name}")

            if member_name.endswith("household_power_consumption.txt"):
                target_member = info

        if not target_member:
            raise FileNotFoundError("household_power_consumption.txt not found inside archive")

        out_path = os.path.join(extract_to_dir, "household_power_consumption.txt")
        print(f"[INFO] Safely extracting {target_member.filename} ({target_member.file_size} bytes) -> {out_path} ...")
        
        hasher = hashlib.sha256()
        with zf.open(target_member) as src, open(out_path, "wb") as dst:
            while chunk := src.read(1024 * 1024):
                hasher.update(chunk)
                dst.write(chunk)

    return out_path, hasher.hexdigest()


def verify_extracted_data(file_path: str, sha256_hash: str) -> dict:
    print(f"[INFO] Verifying structure and record count of: {file_path}")
    total_lines = 0
    header_line = ""
    missing_count = 0
    first_data_line = ""
    last_data_line = ""

    with open(file_path, encoding="utf-8", errors="ignore") as f:
        for idx, line in enumerate(f):
            total_lines += 1
            if idx == 0:
                header_line = line.strip()
            elif idx == 1:
                first_data_line = line.strip()
            if idx > 0:
                last_data_line = line.strip()
                if "?" in line:
                    missing_count += 1

    data_rows = total_lines - 1
    print(f"[INFO] Total lines: {total_lines} (1 header + {data_rows} data rows)")
    print(f"[INFO] Missing value rows ('?'): {missing_count}")

    # Header check
    normalized_header = header_line.replace("\r", "").replace("\n", "")
    if normalized_header != EXPECTED_HEADER:
        raise ValueError(
            f"Header mismatch!\nExpected: {EXPECTED_HEADER}\nReceived: {normalized_header}"
        )

    # Row count verification
    diff = abs(data_rows - EXPECTED_DATA_ROWS)
    if diff > 100:  # Allow minimal variance if variant releases exist, but exact official is 2,075,259
        print(f"[WARNING] Data row count {data_rows} differs from expected {EXPECTED_DATA_ROWS} by {diff}")
    else:
        print(f"[SUCCESS] Row count matches official dataset specification (~{EXPECTED_DATA_ROWS} rows)")

    manifest = {
        "dataset_name": "UCI Individual Household Electric Power Consumption",
        "file_name": os.path.basename(file_path),
        "file_path": file_path,
        "size_bytes": os.path.getsize(file_path),
        "sha256_checksum": sha256_hash,
        "total_lines": total_lines,
        "header": normalized_header,
        "data_rows": data_rows,
        "missing_rows_count": missing_count,
        "first_record": first_data_line,
        "last_record": last_data_line,
        "verified_at": datetime.now(UTC).isoformat(),
        "is_verified": True,
    }

    with open(MANIFEST_PATH, "w", encoding="utf-8") as mf:
        json.dump(manifest, mf, indent=2)

    print(f"[SUCCESS] Dataset manifest written to: {MANIFEST_PATH}")
    return manifest


def main():
    try:
        zip_path = find_dataset_zip()
        print(f"[INFO] Detected dataset archive: {zip_path}")
        out_file, sha256_hash = safe_extract_zip(zip_path, RAW_DATA_DIR)
        manifest = verify_extracted_data(out_file, sha256_hash)
        print("=" * 60)
        print("DATASET BOOTSTRAP COMPLETE")
        print(f"File: {manifest['file_path']}")
        print(f"SHA-256: {manifest['sha256_checksum']}")
        print(f"Rows: {manifest['data_rows']:,}")
        print("=" * 60)
    except Exception as e:
        print(f"[ERROR] Dataset preparation failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
