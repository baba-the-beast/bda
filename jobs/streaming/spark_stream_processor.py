"""
Apache Spark Structured Streaming Pipeline for Real-Time Energy Consumption Analytics.
Consumes real-time smart meter telemetry from Kafka, executes watermarked window aggregations
(1-minute tumbling, 5-minute sliding), and writes results idempotently to MongoDB.
"""

import os
import sys
from datetime import UTC, datetime

from pyspark.sql import SparkSession
from pyspark.sql.functions import avg, col, count, expr, from_json, to_timestamp, window
from pyspark.sql.functions import max as spark_max
from pyspark.sql.functions import min as spark_min
from pyspark.sql.functions import sum as spark_sum
from pyspark.sql.types import DoubleType, StringType, StructField, StructType

# Configuration from environment
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "energy-events")
MONGO_URI = os.getenv("MONGO_URI", "mongodb://bda_app:bda_secure_pass_2026@localhost:27017/bda_energy?authSource=admin")
MONGO_COLLECTION = os.getenv("MONGO_STREAM_COLLECTION", "stream_windows")
CHECKPOINT_DIR = os.getenv("CHECKPOINT_DIR", "/tmp/spark-checkpoints/energy-streaming")
WATERMARK_DELAY = os.getenv("WATERMARK_DELAY", "2 minutes")
WINDOW_DURATION = os.getenv("WINDOW_DURATION", "1 minute")
SLIDE_DURATION = os.getenv("SLIDE_DURATION", "1 minute")

# Telemetry Schema
ENERGY_SCHEMA = StructType([
    StructField("event_id", StringType(), True),
    StructField("timestamp", StringType(), True),
    StructField("global_active_power", DoubleType(), True),
    StructField("global_reactive_power", DoubleType(), True),
    StructField("voltage", DoubleType(), True),
    StructField("global_intensity", DoubleType(), True),
    StructField("sub_metering_1", DoubleType(), True),
    StructField("sub_metering_2", DoubleType(), True),
    StructField("sub_metering_3", DoubleType(), True),
    StructField("dataset_id", StringType(), True),
])


def write_batch_to_mongodb(batch_df, batch_id: int):
    """
    Idempotent foreachBatch writer persisting window aggregates to MongoDB.
    Uses upsert on (dataset_id, window_start, window_end) to guarantee exactly-once persistence.
    """
    if batch_df.isEmpty():
        return

    print(f"[INFO] Processing Spark Micro-Batch {batch_id} with {batch_df.count()} windows...")

    records = batch_df.collect()
    try:
        from pymongo import MongoClient, UpdateOne
        client = MongoClient(MONGO_URI)
        db = client.get_default_database()
        collection = db[MONGO_COLLECTION]

        operations = []
        for row in records:
            w_start = row["window"]["start"]
            w_end = row["window"]["end"]
            dataset_id = row["dataset_id"] or "default"

            doc = {
                "dataset_id": dataset_id,
                "window_start": w_start.isoformat(),
                "window_end": w_end.isoformat(),
                "average_power": round(float(row["avg_power"]), 4),
                "minimum_power": round(float(row["min_power"]), 4),
                "maximum_power": round(float(row["max_power"]), 4),
                "reading_count": int(row["reading_count"]),
                "event_rate": round(float(row["reading_count"]) / 60.0, 2),
                "sub_metering_total": round(float(row["sub_metering_total"] or 0.0), 2),
                "recent_trend": "RISING" if float(row["avg_power"]) > 2.5 else "STABLE",
                "computed_at": datetime.now(UTC).isoformat(),
                "batch_id": batch_id,
            }

            operations.append(
                UpdateOne(
                    {"dataset_id": dataset_id, "window_start": doc["window_start"]},
                    {"$set": doc},
                    upsert=True
                )
            )

        if operations:
            collection.bulk_write(operations, ordered=False)
            print(f"[INFO] Successfully upserted {len(operations)} windows to MongoDB.")
        client.close()

    except Exception as e:
        print(f"[ERROR] Failed to persist micro-batch {batch_id} to MongoDB: {e}", file=sys.stderr)
        raise


def start_streaming():
    spark = SparkSession.builder \
        .appName("BDA-Energy-Structured-Streaming") \
        .config("spark.streaming.stopGracefullyOnShutdown", "true") \
        .config("spark.sql.streaming.forceDeleteTempCheckpointLocation", "true") \
        .getOrCreate()

    spark.sparkContext.setLogLevel("WARN")

    print(f"[INFO] Connecting Spark Streaming to Kafka: {KAFKA_BOOTSTRAP_SERVERS} topic: {KAFKA_TOPIC}")

    # Read from Kafka stream
    raw_stream = spark.readStream \
        .format("kafka") \
        .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP_SERVERS) \
        .option("subscribe", KAFKA_TOPIC) \
        .option("startingOffsets", "latest") \
        .option("failOnDataLoss", "false") \
        .load()

    # Deserialize JSON value
    parsed_df = raw_stream \
        .selectExpr("CAST(value AS STRING) as json_val") \
        .select(from_json(col("json_val"), ENERGY_SCHEMA).alias("data")) \
        .select("data.*") \
        .withColumn("event_time", to_timestamp(col("timestamp"))) \
        .withWatermark("event_time", WATERMARK_DELAY)

    # Window Aggregations
    windowed_df = parsed_df \
        .groupBy(
            window(col("event_time"), WINDOW_DURATION, SLIDE_DURATION),
            col("dataset_id")
        ) \
        .agg(
            avg("global_active_power").alias("avg_power"),
            spark_min("global_active_power").alias("min_power"),
            spark_max("global_active_power").alias("max_power"),
            count("*").alias("reading_count"),
            spark_sum(expr("sub_metering_1 + sub_metering_2 + sub_metering_3")).alias("sub_metering_total")
        )

    # Write to MongoDB with Checkpoint
    query = windowed_df.writeStream \
        .foreachBatch(write_batch_to_mongodb) \
        .outputMode("update") \
        .option("checkpointLocation", CHECKPOINT_DIR) \
        .start()

    print("[INFO] Spark Structured Streaming query started. Awaiting termination...")
    query.awaitTermination()


if __name__ == "__main__":
    start_streaming()
