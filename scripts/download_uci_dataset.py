"""
Official UCI Household Electric Power Consumption Dataset Downloader & Verifier.
URL: https://archive.ics.uci.edu/static/public/235/individual+household+electric+power+consumption.zip
"""

import os
import sys
import zipfile
import hashlib
import urllib.request

DATA_DIR = os.getenv("DATA_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data")))
DATASET_URL = "https://archive.ics.uci.edu/static/public/235/individual+household+electric+power+consumption.zip"
ZIP_FILE = os.path.join(DATA_DIR, "individual_household_electric_power_consumption.zip")
TARGET_TXT = os.path.join(DATA_DIR, "household_power_consumption.txt")


def compute_sha256(filepath: str) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def download_and_extract():
    os.makedirs(DATA_DIR, exist_ok=True)
    if os.path.exists(TARGET_TXT):
        print(f"[INFO] Dataset file already exists at {TARGET_TXT}")
        size_mb = os.path.getsize(TARGET_TXT) / (1024 * 1024)
        print(f"[INFO] File size: {size_mb:.2f} MB")
        return TARGET_TXT

    print(f"[INFO] Downloading official UCI dataset from {DATASET_URL}...")
    try:
        urllib.request.urlretrieve(DATASET_URL, ZIP_FILE)
        print(f"[INFO] Download complete. Extracting to {DATA_DIR}...")
        with zipfile.ZipFile(ZIP_FILE, 'r') as zip_ref:
            zip_ref.extractall(DATA_DIR)
        print(f"[INFO] Extracted successfully. Target: {TARGET_TXT}")
        if os.path.exists(ZIP_FILE):
            os.remove(ZIP_FILE)
        return TARGET_TXT
    except Exception as e:
        print(f"[WARN] Failed to download from official UCI mirror: {e}", file=sys.stderr)
        print(f"[INFO] You can run scripts/generate_sample_data.py to create high-fidelity sample data.", file=sys.stderr)
        return None


if __name__ == "__main__":
    download_and_extract()
