/**
 * OpenTelemetry Protocol Buffer Loader
 * Handles loading and parsing of OTLP protobuf messages
 */

import pkg from 'protobufjs'
import path from 'path'

// Get the load function and class constructors
const { load } = pkg

export class OTLPProtobufLoader {
  private static instance: OTLPProtobufLoader
  private root: any = null
  private exportTraceServiceRequestType: any = null
  private tracesDataType: any = null

  private constructor() {}

  public static getInstance(): OTLPProtobufLoader {
    if (!OTLPProtobufLoader.instance) {
      OTLPProtobufLoader.instance = new OTLPProtobufLoader()
    }
    return OTLPProtobufLoader.instance
  }

  public async initialize(): Promise<void> {
    if (this.root) {
      return // Already initialized
    }

    try {
      // Load the protobuf definitions
      const protoPath = path.join(process.cwd(), 'protobuf')
      
      // Load the main trace service proto file with correct root for imports
      const traceServiceProto = path.join(protoPath, 'opentelemetry/proto/collector/trace/v1/trace_service.proto')
      
      // Use the correct protobufjs API for loading proto files
      // Create a new root with the protobuf directory as the include path
      const { Root } = pkg
      this.root = new Root()
      this.root.resolvePath = (origin: string, target: string) => {
        // Resolve imports relative to the protobuf root directory
        if (target.startsWith('opentelemetry/')) {
          return path.join(protoPath, target)
        }
        return path.resolve(path.dirname(origin), target)
      }
      
      // Load the proto file
      this.root = await this.root.load(traceServiceProto)

      // Get the specific message types we need
      this.exportTraceServiceRequestType = this.root.lookupType('opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest')
      this.tracesDataType = this.root.lookupType('opentelemetry.proto.trace.v1.TracesData')

      console.log('✅ OTLP Protobuf definitions loaded successfully')
    } catch (error) {
      console.error('❌ Failed to load OTLP protobuf definitions:', error)
      throw error
    }
  }

  public parseExportTraceServiceRequest(buffer: Buffer): any {
    if (!this.exportTraceServiceRequestType) {
      throw new Error('Protobuf loader not initialized')
    }

    try {
      // Decode the protobuf message
      const message = this.exportTraceServiceRequestType.decode(buffer)
      
      // Convert to plain object
      const object = this.exportTraceServiceRequestType.toObject(message, {
        longs: String,
        enums: String,
        bytes: String,
        // Include default values
        defaults: true,
        // Convert arrays to plain arrays
        arrays: true,
        // Convert objects to plain objects
        objects: true,
        // Include one-of fields
        oneofs: true
      })

      return object
    } catch (error) {
      console.error('❌ Failed to parse ExportTraceServiceRequest:', error)
      throw error
    }
  }

  public parseTracesData(buffer: Buffer): any {
    if (!this.tracesDataType) {
      throw new Error('Protobuf loader not initialized')
    }

    try {
      // Decode the protobuf message
      const message = this.tracesDataType.decode(buffer)
      
      // Convert to plain object
      const object = this.tracesDataType.toObject(message, {
        longs: String,
        enums: String,
        bytes: String,
        defaults: true,
        arrays: true,
        objects: true,
        oneofs: true
      })

      return object
    } catch (error) {
      console.error('❌ Failed to parse TracesData:', error)
      throw error
    }
  }

  public isInitialized(): boolean {
    return this.root !== null
  }
}