#!/usr/bin/env tsx
/**
 * Code generation script based on Dendron package specifications
 * Reads the notes/packages/*.md files and generates corresponding TypeScript code
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

interface PackageSpec {
  name: string
  description: string
  dependencies: string[]
  exports: string[]
}

// Parse package specification from markdown
const parsePackageSpec = async (specPath: string): Promise<PackageSpec> => {
  const content = await readFile(specPath, 'utf-8')

  // Extract package name from path
  const name = path.basename(path.dirname(specPath))

  // Extract description from frontmatter or first heading
  const descMatch = content.match(/desc:\s*['"]([^'"]+)['"]/)
  const description = descMatch?.[1] || `${name} package`

  // TODO: Parse dependencies and exports from the markdown content
  // This would involve parsing the TypeScript interfaces and Effect-TS patterns

  return {
    name,
    description,
    dependencies: [],
    exports: []
  }
}

// Generate package index file
const generatePackageIndex = async (spec: PackageSpec) => {
  const packageDir = `src/${spec.name}`

  if (!existsSync(packageDir)) {
    await mkdir(packageDir, { recursive: true })
  }

  const indexContent = `/**
 * ${spec.description}
 * 
 * This package was generated from notes/packages/${spec.name}/package.md
 * Auto-generated - do not edit directly
 */

// TODO: Generate actual exports based on package specification
export const packageInfo = {
  name: "${spec.name}",
  description: "${spec.description}",
  version: "0.1.0"
}

console.log(\`📦 \${packageInfo.name} - \${packageInfo.description}\`)
`

  await writeFile(path.join(packageDir, 'index.ts'), indexContent)
  console.log(`✅ Generated ${spec.name} package`)
}

// Main generation process
const main = async () => {
  console.log('🔨 Generating code from Dendron specifications...')

  const packageSpecs = [
    'notes/packages/storage/package.md',
    'notes/packages/ai-analyzer/package.md',
    'notes/packages/llm-manager/package.md',
    'notes/packages/ui-generator/package.md',
    'notes/packages/config-manager/package.md'
  ]

  for (const specPath of packageSpecs) {
    if (existsSync(specPath)) {
      const spec = await parsePackageSpec(specPath)
      // Skip storage since we already implemented it
      if (spec.name !== 'storage') {
        await generatePackageIndex(spec)
      }
    } else {
      console.warn(`⚠️  Specification not found: ${specPath}`)
    }
  }

  console.log('✨ Code generation complete!')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}
