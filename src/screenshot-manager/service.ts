import { Context, Effect, Layer } from 'effect'
import { promises as fs } from 'fs'
import path from 'path'
import { ScreenshotManagerService, ScreenshotUploadOptions, BannerOptions, BlogPost } from './types'

// Cloudinary configuration from environment
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'dlm6bnmny'
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET

// Banner templates following ADR-012 specifications
const bannerTemplates = {
  series: {
    background: 'b_gradient:45deg:rgb:1a202c:rgb:2563eb',
    title: 'Arial_48_bold_center',
    subtitle: 'Arial_32_center',
    series: 'Arial_28_center'
  },
  technical: {
    background: 'b_rgb:0f172a', 
    title: 'Arial_44_bold_center',
    subtitle: 'Arial_30_center'
  },
  milestone: {
    background: 'b_gradient:60deg:rgb:059669:rgb:10b981',
    title: 'Arial_50_bold_center'
  }
}

// Helper functions for the service
const uploadScreenshotImpl = (filePath: string, options: ScreenshotUploadOptions) =>
  Effect.gen(function* (_) {
    // For now, return a mock Cloudinary URL based on the file structure
    // In production, this would upload to Cloudinary using their SDK
    const fileName = path.basename(filePath)
    const cloudinaryUrl = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${options.folder}/${fileName}`
    
    // Validate file exists
    yield* _(Effect.tryPromise({
      try: () => fs.access(filePath),
      catch: (error) => new Error(`Screenshot file not found: ${filePath} - ${error}`)
    }))
    
    // TODO: Implement actual Cloudinary upload
    // const cloudinary = require('cloudinary').v2
    // const result = yield* _(Effect.tryPromise({
    //   try: () => cloudinary.uploader.upload(filePath, {
    //     folder: options.folder,
    //     tags: options.tags,
    //     transformation: options.transformation,
    //     public_id: options.public_id
    //   }),
    //   catch: (error) => new Error(`Cloudinary upload failed: ${error}`)
    // }))
    // return result.secure_url
    
    return cloudinaryUrl
  })

const ScreenshotManagerServiceLive = Layer.succeed(ScreenshotManagerService, {
  uploadScreenshot: uploadScreenshotImpl,

  uploadCuratedScreenshots: (dateFolder: string) =>
    Effect.gen(function* (_) {
      const screenshotsPath = path.join(process.cwd(), 'notes', 'screenshots', dateFolder)
      
      // List all PNG files in the date folder
      const files = yield* _(Effect.tryPromise({
        try: () => fs.readdir(screenshotsPath),
        catch: (error) => new Error(`Failed to read screenshots directory: ${screenshotsPath} - ${error}`)
      }))
      
      const pngFiles = files.filter(file => file.endsWith('.png'))
      const uploadResults: Record<string, string> = {}
      
      // Upload each screenshot
      for (const file of pngFiles) {
        const filePath = path.join(screenshotsPath, file)
        const url = yield* _(uploadScreenshotImpl(filePath, {
          folder: `screenshots/${dateFolder}`,
          tags: ['curated', 'documentation', dateFolder]
        }))
        uploadResults[file] = url
      }
      
      return uploadResults
    }),

  generateBlogBanner: (options: BannerOptions) => {
    const template = bannerTemplates[options.template]
    const titleText = encodeURIComponent(options.title)
    const subtitleText = options.subtitle ? encodeURIComponent(options.subtitle) : ''
    const seriesText = options.series ? encodeURIComponent(options.series) : ''
    
    // Build Cloudinary transformation URL
    let transformations = [
      'w_1200,h_630,c_fill',
      template.background,
      `l_text:${template.title}:${titleText}`,
      'fl_layer_apply,g_center,y_-40,co_white'
    ]
    
    if (subtitleText) {
      transformations.push(
        `l_text:${template.subtitle}:${subtitleText}`,
        'fl_layer_apply,g_center,y_0,co_white'
      )
    }
    
    if (seriesText && options.template === 'series') {
      transformations.push(
        `l_text:${template.series}:${seriesText}`,
        'fl_layer_apply,g_center,y_40,co_rgb:94a3b8'
      )
    }
    
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${transformations.join('/')}/sample`
  },

  generateSeriesCard: (blogPost: BlogPost) => {
    const titleText = encodeURIComponent(blogPost.title)
    const seriesText = encodeURIComponent(`${blogPost.series} - Day ${blogPost.day}`)
    const dateText = encodeURIComponent(blogPost.date)
    
    const transformations = [
      'w_1200,h_630,c_fill',
      'b_gradient:45deg:rgb:1a202c:rgb:2563eb',
      `l_text:Arial_40_bold_center:${titleText}`,
      'fl_layer_apply,g_center,y_-30,co_white',
      `l_text:Arial_24_center:${seriesText}`,
      'fl_layer_apply,g_center,y_20,co_rgb:94a3b8',
      `l_text:Arial_20_center:${dateText}`,
      'fl_layer_apply,g_center,y_50,co_rgb:64748b'
    ]
    
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${transformations.join('/')}/sample`
  },

  listScreenshots: (dateFolder: string) =>
    Effect.gen(function* (_) {
      const screenshotsPath = path.join(process.cwd(), 'notes', 'screenshots', dateFolder)
      
      const files = yield* _(Effect.tryPromise({
        try: () => fs.readdir(screenshotsPath),
        catch: (error) => new Error(`Failed to read screenshots directory: ${screenshotsPath} - ${error}`)
      }))
      
      return files.filter(file => file.endsWith('.png'))
    })
})

export { ScreenshotManagerServiceLive }