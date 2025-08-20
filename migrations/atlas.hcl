# Atlas Configuration for ClickHouse Schema Management
# This file defines the migration environment for our AI-native observability platform

env "local" {
  # Source of truth - schema definition files
  src = "file://schema"
  
  # Target database URL (will be overridden by environment variable)
  url = "clickhouse://otel:otel123@localhost:9000/otel?secure=false"
  
  # Development database for testing migrations
  dev = "clickhouse://otel:otel123@localhost:9000/otel_dev?secure=false"
  
  # Migration directory
  migration {
    dir = "file://clickhouse"
    format = atlas
  }
  
  # Diff policy - how to handle schema differences
  diff {
    skip {
      # Skip system tables
      table = "system.*"
    }
  }
}

env "production" {
  src = "file://schema"
  
  # Production URL from environment variable
  url = getenv("DATABASE_URL")
  
  migration {
    dir = "file://clickhouse"
    format = atlas
    
    # Production safety settings
    baseline = "20250819000000"  # Initial baseline migration
    exec_order = "linear"         # Migrations must be applied in order
  }
}

env "kubernetes" {
  src = "file://schema"
  
  # Kubernetes job configuration
  url = getenv("CLICKHOUSE_URL")
  
  migration {
    dir = "file://clickhouse"
    format = atlas
    
    # K8s job settings
    lock {
      provider = "clickhouse"
      timeout = "10m"
    }
  }
}