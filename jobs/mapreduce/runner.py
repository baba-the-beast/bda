"""
MapReduce Universal Execution Engine.
Supports:
1. Production: Hadoop Streaming CLI execution (`hadoop jar ...`) on YARN / HDFS.
2. Local Development Adapter: Exact stream pipeline execution:
   Input Stream -> Mapper Subprocess -> Partition/Sort Subprocess -> Reducer Subprocess -> Output
Preserves the authentic MapReduce paradigm with zero dummy shortcuts.
"""

import os
import subprocess
import sys
import tempfile
from typing import Dict, List, Optional, Tuple


class MapReduceJobDefinition:
    def __init__(self, job_type: str, mapper_script: str, reducer_script: str):
        self.job_type = job_type
        self.mapper_script = mapper_script
        self.reducer_script = reducer_script


JOB_REGISTRY: Dict[str, MapReduceJobDefinition] = {
    "DAILY": MapReduceJobDefinition(
        "DAILY",
        os.path.join(os.path.dirname(__file__), "daily", "mapper.py"),
        os.path.join(os.path.dirname(__file__), "daily", "reducer.py"),
    ),
    "HOURLY": MapReduceJobDefinition(
        "HOURLY",
        os.path.join(os.path.dirname(__file__), "hourly", "mapper.py"),
        os.path.join(os.path.dirname(__file__), "hourly", "reducer.py"),
    ),
    "MONTHLY": MapReduceJobDefinition(
        "MONTHLY",
        os.path.join(os.path.dirname(__file__), "monthly", "mapper.py"),
        os.path.join(os.path.dirname(__file__), "monthly", "reducer.py"),
    ),
    "PEAK": MapReduceJobDefinition(
        "PEAK",
        os.path.join(os.path.dirname(__file__), "peak", "mapper.py"),
        os.path.join(os.path.dirname(__file__), "peak", "reducer.py"),
    ),
}


class HadoopStreamingRunner:
    """Executes on a live Hadoop / YARN cluster using Hadoop Streaming."""
    def __init__(self, hadoop_home: Optional[str] = None):
        self.hadoop_home = hadoop_home or os.getenv("HADOOP_HOME", "/opt/hadoop")

    def run_cluster_job(
        self,
        job_type: str,
        input_hdfs_path: str,
        output_hdfs_path: str,
        env_vars: Optional[Dict[str, str]] = None,
    ) -> Tuple[bool, str]:
        job_def = JOB_REGISTRY.get(job_type.upper())
        if not job_def:
            return False, f"Unknown job type: {job_type}"

        streaming_jar = os.path.join(self.hadoop_home, "share", "hadoop", "tools", "lib", "hadoop-streaming.jar")
        cmd = [
            "hadoop", "jar", streaming_jar,
            "-files", f"{job_def.mapper_script},{job_def.reducer_script}",
            "-mapper", f"python3 {os.path.basename(job_def.mapper_script)}",
            "-reducer", f"python3 {os.path.basename(job_def.reducer_script)}",
            "-input", input_hdfs_path,
            "-output", output_hdfs_path,
        ]

        run_env = os.environ.copy()
        if env_vars:
            run_env.update(env_vars)

        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=run_env, check=True)
            return True, res.stdout
        except subprocess.CalledProcessError as e:
            return False, f"Hadoop MapReduce failed: {e.stderr}"
        except FileNotFoundError:
            return False, "Hadoop binary not found in PATH."


class LocalStreamingPipelineRunner:
    """
    Local MapReduce Development Adapter.
    Executes the actual mapper script, performs standard key-based partition/sort,
    and feeds into the actual reducer script.
    """
    @staticmethod
    def run_pipeline(
        job_type: str,
        input_file_path: str,
        output_file_path: str,
        env_vars: Optional[Dict[str, str]] = None,
    ) -> Tuple[bool, str]:
        job_def = JOB_REGISTRY.get(job_type.upper())
        if not job_def:
            return False, f"Unknown job type: {job_type}"

        if not os.path.exists(input_file_path):
            return False, f"Input dataset not found at {input_file_path}"

        run_env = os.environ.copy()
        if env_vars:
            run_env.update(env_vars)

        python_bin = sys.executable

        try:
            # Step 1: Execute Mapper with input stream
            with open(input_file_path, "r", encoding="utf-8") as in_f:
                p_map = subprocess.Popen(
                    [python_bin, job_def.mapper_script],
                    stdin=in_f,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    env=run_env,
                    text=True,
                )
                map_out, map_err = p_map.communicate()

            if p_map.returncode != 0:
                return False, f"Mapper error: {map_err}"

            # Step 2: MapReduce Shuffle & Sort (group by Key before tab)
            lines = [ln for ln in map_out.strip().splitlines() if ln]
            lines.sort(key=lambda line: line.split("\t")[0] if "\t" in line else line)
            sorted_map_output = "\n".join(lines) + "\n"

            # Step 3: Execute Reducer with sorted stream
            p_red = subprocess.Popen(
                [python_bin, job_def.reducer_script],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=run_env,
                text=True,
            )
            red_out, red_err = p_red.communicate(input=sorted_map_output)

            if p_red.returncode != 0:
                return False, f"Reducer error: {red_err}"

            os.makedirs(os.path.dirname(os.path.abspath(output_file_path)), exist_ok=True)
            with open(output_file_path, "w", encoding="utf-8") as out_f:
                out_f.write(red_out)

            line_count = len(red_out.strip().splitlines())
            return True, f"MapReduce {job_type} completed successfully. Produced {line_count} aggregated records."

        except Exception as e:
            return False, f"Execution failed: {str(e)}"
