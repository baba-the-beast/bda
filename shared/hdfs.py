"""
HDFS Storage Abstraction Layer.
Isolates the rest of the platform from underlying distributed filesystem details.
Implements:
1. Production WebHDFS REST API Client (Hadoop 3.x NameNode WebHDFS)
2. Local Development & Testing Adapter (hierarchical path emulation)
"""

import os
import shutil
import urllib.request
from abc import ABC, abstractmethod


class HDFSStorageClient(ABC):
    @abstractmethod
    def upload_raw(self, dataset_id: str, local_file_path: str) -> str:
        pass

    @abstractmethod
    def write_cleaned(self, dataset_id: str, local_file_path: str) -> str:
        pass

    @abstractmethod
    def write_rejected(self, dataset_id: str, local_file_path: str) -> str:
        pass

    @abstractmethod
    def get_output_path(self, job_type: str, run_id: str) -> str:
        pass

    @abstractmethod
    def file_exists(self, hdfs_path: str) -> bool:
        pass

    @abstractmethod
    def read_lines(self, hdfs_path: str, limit: int = 100) -> list[str]:
        pass


class LocalHDFSAdapter(HDFSStorageClient):
    """
    Local filesystem HDFS adapter for development and integration testing.
    Mirrors the exact logical HDFS layout under data/hdfs/user/bda/energy/.
    """
    def __init__(self, base_dir: str | None = None):
        self.base_dir: str = (
            base_dir
            or os.environ.get("LOCAL_HDFS_ROOT")
            or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "hdfs"))
        )
        self.root_prefix = "/user/bda/energy"
        os.makedirs(os.path.join(self.base_dir, "user", "bda", "energy", "raw"), exist_ok=True)
        os.makedirs(os.path.join(self.base_dir, "user", "bda", "energy", "cleaned"), exist_ok=True)
        os.makedirs(os.path.join(self.base_dir, "user", "bda", "energy", "output"), exist_ok=True)
        os.makedirs(os.path.join(self.base_dir, "user", "bda", "energy", "rejected"), exist_ok=True)

    def _resolve_physical_path(self, logical_hdfs_path: str) -> str:
        rel = logical_hdfs_path.lstrip("/").replace("/", os.sep)
        return os.path.join(self.base_dir, rel)

    def upload_raw(self, dataset_id: str, local_file_path: str) -> str:
        logical_path = f"/user/bda/energy/raw/{dataset_id}/household_power_consumption.txt"
        target_physical = self._resolve_physical_path(logical_path)
        os.makedirs(os.path.dirname(target_physical), exist_ok=True)
        shutil.copyfile(local_file_path, target_physical)
        return logical_path

    def write_cleaned(self, dataset_id: str, local_file_path: str) -> str:
        logical_path = f"/user/bda/energy/cleaned/{dataset_id}/part-00000.csv"
        target_physical = self._resolve_physical_path(logical_path)
        os.makedirs(os.path.dirname(target_physical), exist_ok=True)
        shutil.copyfile(local_file_path, target_physical)
        return logical_path

    def write_rejected(self, dataset_id: str, local_file_path: str) -> str:
        logical_path = f"/user/bda/energy/rejected/{dataset_id}/rejected_records.log"
        target_physical = self._resolve_physical_path(logical_path)
        os.makedirs(os.path.dirname(target_physical), exist_ok=True)
        shutil.copyfile(local_file_path, target_physical)
        return logical_path

    def get_output_path(self, job_type: str, run_id: str) -> str:
        return f"/user/bda/energy/output/{job_type.lower()}/{run_id}/"

    def file_exists(self, logical_hdfs_path: str) -> bool:
        physical = self._resolve_physical_path(logical_hdfs_path)
        return os.path.exists(physical)

    def read_lines(self, logical_hdfs_path: str, limit: int = 100) -> list[str]:
        physical = self._resolve_physical_path(logical_hdfs_path)
        if not os.path.exists(physical):
            return []
        lines = []
        with open(physical, encoding="utf-8", errors="ignore") as f:
            for idx, line in enumerate(f):
                if idx >= limit:
                    break
                lines.append(line.rstrip("\r\n"))
        return lines

    def get_local_path(self, logical_hdfs_path: str) -> str:
        return self._resolve_physical_path(logical_hdfs_path)


class WebHDFSClient(HDFSStorageClient):
    """
    Production WebHDFS client communicating with Hadoop NameNode & DataNode HTTP APIs.
    Implements full 2-phase WebHDFS write:
    1. PUT to NameNode with ?op=CREATE -> captures 307 Temporary Redirect with DataNode Location
    2. PUT payload to DataNode Location URL
    """
    def __init__(self, webhdfs_url: str | None = None):
        self.webhdfs_url = webhdfs_url or os.getenv("WEBHDFS_URL", "http://namenode:9870/webhdfs/v1")
        self.user = os.getenv("HADOOP_USER_NAME", "bda")

    def _execute_put_upload(self, logical_path: str, local_file_path: str) -> str:
        """Executes the standard 2-step WebHDFS upload protocol."""
        nn_url = f"{self.webhdfs_url}{logical_path}?op=CREATE&overwrite=true&user.name={self.user}"
        
        # Phase 1: Request upload location from NameNode (prevents following 307 with empty body)
        class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
            def http_error_307(self, req, fp, code, msg, headers):
                return fp

        opener = urllib.request.build_opener(NoRedirectHandler)
        req = urllib.request.Request(nn_url, method="PUT")
        
        try:
            resp = opener.open(req)
            datanode_location = resp.headers.get("Location")
            if not datanode_location:
                # NameNode might handle redirect transparently if configured
                datanode_location = resp.geturl() if resp.getcode() in (200, 201) else None

            if not datanode_location:
                raise RuntimeError(f"WebHDFS NameNode did not provide DataNode redirection: HTTP {resp.getcode()}")

            # Phase 2: Stream file contents to DataNode
            with open(local_file_path, "rb") as f:
                data = f.read()

            upload_req = urllib.request.Request(datanode_location, data=data, method="PUT")
            upload_req.add_header("Content-Type", "application/octet-stream")
            with urllib.request.urlopen(upload_req) as up_resp:
                if up_resp.getcode() not in (200, 201):
                    raise RuntimeError(f"WebHDFS DataNode upload returned HTTP {up_resp.getcode()}")

            return logical_path
        except Exception as e:
            raise RuntimeError(f"WebHDFS upload failed for {logical_path}: {e!s}") from e

    def upload_raw(self, dataset_id: str, local_file_path: str) -> str:
        logical_path = f"/user/bda/energy/raw/{dataset_id}/household_power_consumption.txt"
        return self._execute_put_upload(logical_path, local_file_path)

    def write_cleaned(self, dataset_id: str, local_file_path: str) -> str:
        logical_path = f"/user/bda/energy/cleaned/{dataset_id}/part-00000.csv"
        return self._execute_put_upload(logical_path, local_file_path)

    def write_rejected(self, dataset_id: str, local_file_path: str) -> str:
        logical_path = f"/user/bda/energy/rejected/{dataset_id}/rejected_records.log"
        return self._execute_put_upload(logical_path, local_file_path)

    def get_output_path(self, job_type: str, run_id: str) -> str:
        return f"/user/bda/energy/output/{job_type.lower()}/{run_id}/"

    def file_exists(self, logical_hdfs_path: str) -> bool:
        url = f"{self.webhdfs_url}{logical_hdfs_path}?op=GETFILESTATUS&user.name={self.user}"
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req) as resp:
                return resp.getcode() == 200
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False
            raise
        except Exception:
            return False

    def read_lines(self, logical_hdfs_path: str, limit: int = 100) -> list[str]:
        url = f"{self.webhdfs_url}{logical_hdfs_path}?op=OPEN&length=65536&user.name={self.user}"
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req) as resp:
                content = resp.read().decode("utf-8", errors="ignore")
                return content.splitlines()[:limit]
        except Exception:
            return []

    def get_local_path(self, logical_hdfs_path: str) -> str:
        # In cluster mode, direct physical paths are on cluster nodes; logical path returned
        return logical_hdfs_path


def get_hdfs_client() -> HDFSStorageClient:
    bda_mode = os.getenv("BDA_MODE", "RENDER_LITE").upper()
    hdfs_mode = os.getenv("HDFS_MODE", "auto").lower()

    if bda_mode == "FULL_BDA" or hdfs_mode == "cluster":
        return WebHDFSClient()
    return LocalHDFSAdapter()

