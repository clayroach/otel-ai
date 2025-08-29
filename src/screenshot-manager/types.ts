import { Context, Effect } from 'effect'

export interface ScreenshotUploadOptions {
  readonly folder: string
  readonly tags?: readonly string[]
  readonly transformation?: string
  readonly public_id?: string
}

export interface BannerOptions {
  readonly title: string
  readonly subtitle?: string
  readonly series?: string
  readonly template: 'series' | 'technical' | 'milestone'
  readonly day?: number
}

export interface BlogPost {
  readonly title: string
  readonly subtitle?: string
  readonly series: string
  readonly date: string
  readonly day: number
}

export interface ScreenshotManagerServiceImpl {
  readonly uploadScreenshot: (filePath: string, options: ScreenshotUploadOptions) => Effect.Effect<string, Error>
  readonly uploadCuratedScreenshots: (dateFolder: string) => Effect.Effect<Record<string, string>, Error>
  readonly generateBlogBanner: (options: BannerOptions) => string
  readonly generateSeriesCard: (blogPost: BlogPost) => string
  readonly listScreenshots: (dateFolder: string) => Effect.Effect<readonly string[], Error>
}

export class ScreenshotManagerService extends Context.Tag('ScreenshotManagerService')<ScreenshotManagerService, ScreenshotManagerServiceImpl>() {}