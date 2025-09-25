/**
 * TEST FILE: TypeScript Error Test
 *
 * This file intentionally contains TypeScript errors to test:
 * 1. Improved Slack notification error messages
 * 2. Clear identification of TypeScript compilation failures
 * 3. Actionable error reporting in CI/CD
 */

// TypeScript Error 1: Using 'any' type
export function processData(data: any): any {
  // This will trigger ESLint and TypeScript errors
  return data.map((item: any) => item.value)
}

// TypeScript Error 2: Type mismatch
export function addNumbers(a: number, b: number): string {
  // @ts-expect-error: Intentional - returning wrong type
  return a + b // Should return number, not string
}

// TypeScript Error 3: Missing type annotations
export const untypedFunction = (x, y) => {
  return x + y
}

// TypeScript Error 4: Invalid property access
export function accessInvalidProperty() {
  const obj = { name: 'test' }
  // @ts-expect-error: Property doesn't exist
  return obj.invalidProperty.nested.value
}

// TypeScript Error 5: Incorrect interface implementation
interface StrictInterface {
  requiredMethod(): void
  requiredProperty: string
}

export class IncorrectImplementation implements StrictInterface {
  // Missing requiredMethod and requiredProperty
  someOtherMethod() {
    return 'wrong'
  }
}
