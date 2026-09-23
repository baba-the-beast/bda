import os
import sys
import tempfile

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, BASE_DIR)
from scripts.dev_server import prep_mod

preprocess_dataset = prep_mod.preprocess_dataset


def test_preprocessing_and_missing_value_handling():
    raw_content = (
        "Date;Time;Global_active_power;Global_reactive_power;Voltage;Global_intensity;Sub_metering_1;Sub_metering_2;Sub_metering_3\n"
        "16/12/2006;17:24:00;4.216;0.418;234.84;18.4;0.0;1.0;17.0\n"
        "16/12/2006;17:25:00;?;?;?;?;?;?;?\n"  # Missing row
        "16/12/2006;17:26:00;9.120;0.520;235.10;38.8;0.0;2.0;35.0\n"  # Extreme spike candidate (>8 kW)
        "16/12/2006;17:27:00;invalid_power;0.2;230.0;5.0;0;0;0\n"      # Malformed numeric
        "malformed_line_no_delimiters\n"                                 # Invalid column count
    )

    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt") as in_f, \
         tempfile.NamedTemporaryFile("w", delete=False, suffix=".csv") as clean_f, \
         tempfile.NamedTemporaryFile("w", delete=False, suffix=".log") as rej_f:
        in_path = in_f.name
        clean_path = clean_f.name
        rej_path = rej_f.name
        in_f.write(raw_content)

    try:
        report = preprocess_dataset(in_path, clean_path, rej_path)

        assert report.total_input_rows == 5
        assert report.valid_rows == 2  # rows 1 and 3
        assert report.missing_value_rows == 1  # row 2
        assert report.rejected_rows == 3  # rows 2, 4, 5
        assert report.extreme_candidate_count == 1  # row 3 (>8kW)

        # Check clean file content
        with open(clean_path, encoding="utf-8") as f:
            lines = [ln.strip() for ln in f if ln.strip()]
        assert len(lines) == 3  # Header + 2 clean rows
        assert "2006-12-16T17:24:00Z,4.216" in lines[1]
        assert "2006-12-16T17:26:00Z,9.120" in lines[2]

        # Check rejected file content
        with open(rej_path, encoding="utf-8") as f:
            rej_lines = [ln.strip() for ln in f if ln.strip()]
        assert len(rej_lines) == 4  # Header + 3 rejected lines
        assert any("MISSING_VALUE_QUESTION_MARK" in line for line in rej_lines)
        assert any("NUMERIC_CONVERSION_ERROR" in line for line in rej_lines)
        assert any("INVALID_COLUMN_COUNT" in line for line in rej_lines)

    finally:
        for p in (in_path, clean_path, rej_path):
            if os.path.exists(p):
                os.remove(p)
