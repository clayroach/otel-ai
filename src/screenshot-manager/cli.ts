#!/usr/bin/env node
import { Effect, Console } from 'effect'
import { ScreenshotManagerService, ScreenshotManagerServiceLive } from './index'

const program = Effect.gen(function* (_) {
  const screenshotManager = yield* _(ScreenshotManagerService)
  
  // List screenshots for today
  const dateFolder = '2025-08-29'
  yield* _(Console.log(`\n📸 Listing curated screenshots for ${dateFolder}:`))
  
  const screenshots = yield* _(screenshotManager.listScreenshots(dateFolder))
  for (const screenshot of screenshots) {
    yield* _(Console.log(`  • ${screenshot}`))
  }
  
  // Generate mock Cloudinary URLs for curated screenshots
  yield* _(Console.log(`\n☁️  Generating Cloudinary URLs:`))
  const uploadResults = yield* _(screenshotManager.uploadCuratedScreenshots(dateFolder))
  
  for (const [filename, url] of Object.entries(uploadResults)) {
    yield* _(Console.log(`  • ${filename} → ${url}`))
  }
  
  // Generate sample blog banners
  yield* _(Console.log(`\n🎨 Generating blog banners:`))
  
  const dayBanner = screenshotManager.generateBlogBanner({
    title: 'Day 17: Final Infrastructure Cleanup',
    subtitle: 'Context Engineering & Screenshot Organization',
    series: '30-Day AI-Native Observability Platform',
    template: 'series',
    day: 17
  })
  yield* _(Console.log(`  • Series Banner: ${dayBanner}`))
  
  const technicalBanner = screenshotManager.generateBlogBanner({
    title: 'Screenshot Management Architecture',
    subtitle: 'Cloudinary Integration with Effect-TS',
    template: 'technical'
  })
  yield* _(Console.log(`  • Technical Banner: ${technicalBanner}`))
  
  const milestoneBanner = screenshotManager.generateBlogBanner({
    title: 'Context Engineering Paradigm',
    template: 'milestone'
  })
  yield* _(Console.log(`  • Milestone Banner: ${milestoneBanner}`))
})

// Run the program
Effect.runPromise(
  Effect.provide(program, ScreenshotManagerServiceLive)
).catch(console.error)