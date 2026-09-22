"""
Pytest configuration and global environment fixtures.
Sets memory datastore mode and test credentials for fast, isolated test execution.
"""

import os
import pytest

# Ensure isolated in-memory testing mode
os.environ["DATA_STORE_MODE"] = "memory"
os.environ["ENVIRONMENT"] = "test"
os.environ["JWT_SECRET"] = "test-secret-key-at-least-32-chars-long-for-testing-purposes"
os.environ["ENABLE_DEMO_SEED"] = "false"
os.environ["BDA_MODE"] = "RENDER_LITE"
