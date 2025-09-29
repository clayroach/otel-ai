/**
 * Deterministic Random - Seeded random number generator for reproducible data
 */

// Simple seeded random number generator (Mulberry32)
// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
export class SeededRandom {
  private seed: number

  constructor(seed: number = Date.now()) {
    this.seed = seed >>> 0 // Ensure unsigned 32-bit integer
  }

  // Returns a random number between 0 and 1
  next(): number {
    let t = (this.seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  // Returns a random integer between min (inclusive) and max (exclusive)
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min
  }

  // Returns a random element from an array
  choice<T>(array: readonly T[]): T {
    const index = this.nextInt(0, array.length)
    const element = array[index]
    if (element === undefined) {
      throw new Error('Cannot choose from empty array')
    }
    return element
  }

  // Returns true with the given probability (0-1)
  probability(p: number): boolean {
    return this.next() < p
  }

  // Shuffle an array (Fisher-Yates algorithm)
  shuffle<T>(array: readonly T[]): T[] {
    const result = [...array]
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1)
      const temp = result[i]
      const swap = result[j]
      if (temp !== undefined && swap !== undefined) {
        result[i] = swap
        result[j] = temp
      }
    }
    return result
  }

  // Generate a UUID-like string (not cryptographically secure, but deterministic)
  uuid(): string {
    const hex = '0123456789abcdef'
    let uuid = ''
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        uuid += '-'
      } else if (i === 14) {
        uuid += '4' // Version 4
      } else if (i === 19) {
        uuid += hex[this.nextInt(8, 12)] // Variant
      } else {
        uuid += hex[this.nextInt(0, 16)]
      }
    }
    return uuid
  }

  // Generate a trace ID (32 hex characters)
  traceId(): string {
    const hex = '0123456789abcdef'
    let id = ''
    for (let i = 0; i < 32; i++) {
      id += hex[this.nextInt(0, 16)]
    }
    return id
  }

  // Generate a span ID (16 hex characters)
  spanId(): string {
    const hex = '0123456789abcdef'
    let id = ''
    for (let i = 0; i < 16; i++) {
      id += hex[this.nextInt(0, 16)]
    }
    return id
  }
}

// Factory function
export const createSeededRandom = (seed?: number): SeededRandom => {
  return new SeededRandom(seed)
}
