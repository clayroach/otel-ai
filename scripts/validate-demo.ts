#!/usr/bin/env tsx

/**
 * Demo Validation Script
 * 
 * Comprehensive end-to-end validation of the OpenTelemetry Demo integration
 * with our AI-native observability platform.
 * 
 * Tests:
 * 1. Platform services health (ClickHouse, Collector, Backend)
 * 2. Demo services are running and generating telemetry
 * 3. Telemetry flow from demo to ClickHouse (collector path)
 * 4. API endpoints returning live data
 * 5. Service statistics and anomaly detection
 */

import chalk from 'chalk';

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

class DemoValidator {
  private results: ValidationResult[] = [];

  private log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info'): void {
    const colors = {
      info: chalk.blue,
      success: chalk.green,
      error: chalk.red,
      warn: chalk.yellow
    };
    console.log(colors[type](`[validate] ${message}`));
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchJson(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  private async execCommand(command: string): Promise<string> {
    const { execSync } = await import('child_process');
    try {
      return execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim();
    } catch (error: any) {
      throw new Error(`Command failed: ${command}\n${error.message}`);
    }
  }

  async validatePlatformHealth(): Promise<void> {
    this.log('🏥 Checking platform services health...');
    
    try {
      // Check if required containers are running
      const containers = await this.execCommand('docker ps --format "{{.Names}}" | grep -E "(clickhouse|collector|backend)"');
      const runningServices = containers.split('\n').filter(Boolean);
      
      const expectedServices = ['otel-ai-clickhouse', 'otel-ai-collector', 'otel-ai-backend'];
      const missingServices = expectedServices.filter(service => 
        !runningServices.some(running => running.includes(service.replace('otel-ai-', '')))
      );
      
      if (missingServices.length > 0) {
        throw new Error(`Missing services: ${missingServices.join(', ')}`);
      }

      // Check backend health endpoint
      const health = await this.fetchJson('http://localhost:4319/health');
      if (health.status !== 'healthy' || !health.clickhouse) {
        throw new Error(`Backend unhealthy: ${JSON.stringify(health)}`);
      }

      this.results.push({
        name: 'Platform Health',
        passed: true,
        message: `All platform services healthy (${runningServices.length} services running)`,
        details: { services: runningServices, backend: health }
      });

    } catch (error) {
      this.results.push({
        name: 'Platform Health',
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async validateDemoServices(): Promise<void> {
    this.log('🎯 Checking demo services status...');
    
    try {
      // Check if demo containers are running
      const demoStatus = await this.execCommand('cd demo/otel-demo-app && docker compose ps --format "{{.Name}} {{.Status}}" | grep -c "Up"');
      const runningDemoServices = parseInt(demoStatus);
      
      if (runningDemoServices < 10) { // Expect at least 10 demo services
        throw new Error(`Only ${runningDemoServices} demo services running (expected 10+)`);
      }

      // Check if load generator is active
      const loadGenStatus = await this.execCommand('cd demo/otel-demo-app && docker compose ps load-generator --format "{{.Status}}"');
      if (!loadGenStatus.includes('Up')) {
        throw new Error('Load generator not running');
      }

      this.results.push({
        name: 'Demo Services',
        passed: true,
        message: `${runningDemoServices} demo services running with active load generation`,
        details: { runningServices: runningDemoServices }
      });

    } catch (error) {
      this.results.push({
        name: 'Demo Services',
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async validateTelemetryFlow(): Promise<void> {
    this.log('📊 Validating telemetry data flow...');
    
    try {
      // Check collector path (otel_traces table)
      const collectorQuery = `
        SELECT 
          COUNT(*) as total_traces,
          COUNT(DISTINCT ServiceName) as unique_services,
          MAX(Timestamp) as latest_trace,
          COUNT(CASE WHEN Timestamp > now() - INTERVAL 2 MINUTE THEN 1 END) as recent_traces
        FROM otel_traces
      `;
      
      const collectorResult = await this.execCommand(
        `docker exec otel-ai-clickhouse clickhouse-client -u otel --password otel123 --database otel --format JSONEachRow --query "${collectorQuery}"`
      );
      
      const collectorData = JSON.parse(collectorResult);
      
      if (collectorData.total_traces < 1000) {
        throw new Error(`Insufficient trace data: ${collectorData.total_traces} traces (expected 1000+)`);
      }
      
      if (collectorData.unique_services < 10) {
        throw new Error(`Too few services: ${collectorData.unique_services} services (expected 10+)`);
      }
      
      if (collectorData.recent_traces < 50) {
        throw new Error(`No recent telemetry: ${collectorData.recent_traces} traces in last 2 minutes (expected 50+)`);
      }

      // Check direct path (ai_traces_direct table) 
      const directQuery = `SELECT COUNT(*) as total_direct_traces FROM ai_traces_direct`;
      const directResult = await this.execCommand(
        `docker exec otel-ai-clickhouse clickhouse-client -u otel --password otel123 --database otel --format JSONEachRow --query "${directQuery}"`
      );
      const directData = JSON.parse(directResult);

      this.results.push({
        name: 'Telemetry Flow',
        passed: true,
        message: `Collector: ${collectorData.total_traces} traces from ${collectorData.unique_services} services, Direct: ${directData.total_direct_traces} traces`,
        details: {
          collector: collectorData,
          direct: directData,
          latestTrace: collectorData.latest_trace
        }
      });

    } catch (error) {
      this.results.push({
        name: 'Telemetry Flow',
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async validateAPIEndpoints(): Promise<void> {
    this.log('🔌 Testing API endpoints...');
    
    try {
      // Test traces endpoint
      const tracesData = await this.fetchJson('http://localhost:4319/api/traces?limit=10');
      if (!tracesData.traces || tracesData.traces.length === 0) {
        throw new Error('Traces API returned no data');
      }

      // Test service stats endpoint
      const statsData = await this.fetchJson('http://localhost:4319/api/services/stats');
      if (!statsData.services || statsData.services.length === 0) {
        throw new Error('Service stats API returned no data');
      }

      // Validate data structure
      const sampleTrace = tracesData.traces[0];
      const requiredFields = ['trace_id', 'service_name', 'operation_name', 'duration_ms', 'timestamp'];
      const missingFields = requiredFields.filter(field => !(field in sampleTrace));
      
      if (missingFields.length > 0) {
        throw new Error(`Trace data missing fields: ${missingFields.join(', ')}`);
      }

      const sampleStats = statsData.services[0];
      const requiredStatsFields = ['service_name', 'trace_count', 'avg_duration_ms'];
      const missingStatsFields = requiredStatsFields.filter(field => !(field in sampleStats));
      
      if (missingStatsFields.length > 0) {
        throw new Error(`Stats data missing fields: ${missingStatsFields.join(', ')}`);
      }

      this.results.push({
        name: 'API Endpoints',
        passed: true,
        message: `Traces API: ${tracesData.count} traces, Stats API: ${statsData.services.length} services`,
        details: {
          traces: { count: tracesData.count, sample: sampleTrace },
          stats: { serviceCount: statsData.services.length, sample: sampleStats }
        }
      });

    } catch (error) {
      this.results.push({
        name: 'API Endpoints',
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async validateServiceActivity(): Promise<void> {
    this.log('⚡ Checking service activity and performance...');
    
    try {
      const statsData = await this.fetchJson('http://localhost:4319/api/services/stats?since=5 MINUTE');
      
      // Find most active services
      const services = statsData.services;
      const topServices = services.slice(0, 5);
      
      // Validate we have expected demo services
      const expectedDemoServices = ['frontend', 'cart', 'checkout', 'payment'];
      const foundServices = services.map((s: any) => s.service_name);
      const foundExpectedServices = expectedDemoServices.filter(service => 
        foundServices.includes(service)
      );
      
      if (foundExpectedServices.length < 3) {
        throw new Error(`Expected demo services not found. Found: ${foundExpectedServices.join(', ')}`);
      }

      // Check for reasonable activity levels
      const totalTraces = services.reduce((sum: number, service: any) => 
        sum + parseInt(service.trace_count), 0
      );
      
      if (totalTraces < 500) {
        throw new Error(`Low activity: only ${totalTraces} traces in last 5 minutes`);
      }

      // Check for performance metrics
      const avgDurations = topServices.map((s: any) => parseFloat(s.avg_duration_ms));
      const maxDuration = Math.max(...avgDurations);
      
      this.results.push({
        name: 'Service Activity',
        passed: true,
        message: `${services.length} services active, ${totalTraces} traces in 5min, max avg duration: ${maxDuration.toFixed(2)}ms`,
        details: {
          serviceCount: services.length,
          totalTraces,
          topServices: topServices.map((s: any) => ({ 
            name: s.service_name, 
            traces: s.trace_count, 
            avgDuration: s.avg_duration_ms 
          })),
          foundDemoServices: foundExpectedServices
        }
      });

    } catch (error) {
      this.results.push({
        name: 'Service Activity',
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async validateDataFreshness(): Promise<void> {
    this.log('🕒 Checking data freshness...');
    
    try {
      // Check how recent the latest data is
      const query = `
        SELECT 
          ServiceName as service_name,
          MAX(Timestamp) as latest_timestamp,
          COUNT(CASE WHEN Timestamp > now() - INTERVAL 1 MINUTE THEN 1 END) as last_minute_traces
        FROM otel_traces 
        GROUP BY ServiceName 
        ORDER BY latest_timestamp DESC 
        LIMIT 5
      `;
      
      const result = await this.execCommand(
        `docker exec otel-ai-clickhouse clickhouse-client -u otel --password otel123 --database otel --format JSONEachRow --query "${query}"`
      );
      
      const services = result.trim().split('\n').map(line => JSON.parse(line));
      
      // Check if we have very recent data (within last minute)
      const recentServices = services.filter(s => s.last_minute_traces > 0);
      
      if (recentServices.length === 0) {
        throw new Error('No services have generated traces in the last minute');
      }

      const totalRecentTraces = recentServices.reduce((sum, s) => sum + s.last_minute_traces, 0);
      
      if (totalRecentTraces < 20) {
        throw new Error(`Low recent activity: only ${totalRecentTraces} traces in last minute`);
      }

      this.results.push({
        name: 'Data Freshness',
        passed: true,
        message: `${recentServices.length} services active in last minute, ${totalRecentTraces} recent traces`,
        details: {
          recentServices: recentServices.length,
          totalRecentTraces,
          latestTimestamp: services[0]?.latest_timestamp
        }
      });

    } catch (error) {
      this.results.push({
        name: 'Data Freshness',
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private printSummary(): void {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    
    console.log('\n' + '='.repeat(60));
    console.log(chalk.bold('DEMO VALIDATION SUMMARY'));
    console.log('='.repeat(60));
    
    this.results.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      const color = result.passed ? chalk.green : chalk.red;
      console.log(`${icon} ${color(result.name)}: ${result.message}`);
    });
    
    console.log('='.repeat(60));
    
    if (passed === total) {
      console.log(chalk.green.bold(`🎉 ALL VALIDATIONS PASSED (${passed}/${total})`));
      console.log(chalk.green('✅ Demo integration is working correctly!'));
      console.log('');
      console.log(chalk.blue('🌐 Demo Frontend: http://localhost:8080'));
      console.log(chalk.blue('🎯 Load Generator: http://localhost:8089'));
      console.log(chalk.blue('📊 Your Platform: http://localhost:5173'));
    } else {
      console.log(chalk.red.bold(`❌ VALIDATIONS FAILED (${passed}/${total} passed)`));
      console.log(chalk.red('Some issues need to be resolved.'));
    }
    
    console.log('='.repeat(60));
  }

  async runAllValidations(): Promise<boolean> {
    this.log('🚀 Starting comprehensive demo validation...');
    console.log('');

    const validations = [
      () => this.validatePlatformHealth(),
      () => this.validateDemoServices(), 
      () => this.validateTelemetryFlow(),
      () => this.validateAPIEndpoints(),
      () => this.validateServiceActivity(),
      () => this.validateDataFreshness()
    ];

    for (const validation of validations) {
      await validation();
      await this.sleep(500); // Brief pause between validations
    }

    this.printSummary();
    
    const allPassed = this.results.every(r => r.passed);
    return allPassed;
  }
}

// Main execution
async function main() {
  const validator = new DemoValidator();
  
  try {
    const success = await validator.runAllValidations();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('❌ Validation failed with error:'), error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}