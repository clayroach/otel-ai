#!/bin/sh
# Portkey entrypoint script that preprocesses config before starting

echo "[Portkey] Starting with config preprocessing..."

# Run the preprocessing script
node /scripts/process-portkey-config.js

# Check if preprocessing succeeded
if [ $? -ne 0 ]; then
    echo "[Portkey] Config preprocessing failed!"
    exit 1
fi

# Check if processed config exists
if [ ! -f /config/config.processed.json ]; then
    echo "[Portkey] Processed config not found!"
    exit 1
fi

echo "[Portkey] Using processed config at /config/config.processed.json"

# Update CONFIG_PATH to use the processed config
export CONFIG_PATH=/config/config.processed.json

echo "[Portkey] Starting gateway..."

# Start Portkey using the same command from the original image
cd /app && exec npm run start:node