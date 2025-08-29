# ADR-012: Screenshot and Image Management with Cloudinary Integration

## Status
**ACCEPTED** - 2025-08-29

## Context

The AI-native observability platform requires a comprehensive solution for managing screenshots and automatically generating blog-specific images. Current challenges include:

### **Current Pain Points:**
1. **Screenshot Organization**: E2E tests generate screenshots in `target/screenshots/` but need manual curation for documentation
2. **Permanent URL Requirements**: Blog posts on Dev.to, Medium, and GitHub need stable, external-accessible image URLs
3. **Branch Lifecycle Issues**: Feature branch URLs break after branch deletion, making PR screenshots disappear
4. **Manual Banner Creation**: Blog hero images and social cards require manual design work
5. **Scattered Image Assets**: Screenshots come from multiple sources (Playwright tests, desktop captures, mobile screenshots)

### **Requirements Identified:**

#### **Core Requirements:**
- **R1**: Curated screenshot workflow - Manual selection of best images, not automatic upload of all test screenshots
- **R2**: Permanent, external-accessible URLs for blog posts and documentation
- **R3**: Automated blog banner generation with consistent branding
- **R4**: Date-based organization maintaining `notes/screenshots/YYYY-MM-DD/` structure
- **R5**: Multi-source image aggregation (test screenshots, desktop captures, mobile screenshots)

#### **Technical Requirements:**
- **T1**: CDN-backed hosting for fast image delivery globally
- **T2**: API-driven image transformations and banner generation
- **T3**: Integration with existing CI/CD workflows
- **T4**: Support for multiple image formats (PNG, JPG, WebP optimization)
- **T5**: Automated social media card generation for blog posts

#### **Workflow Requirements:**
- **W1**: Developer reviews test screenshots and selects best ones for documentation
- **W2**: Selected screenshots moved to `notes/screenshots/YYYY-MM-DD/` structure
- **W3**: Automatic Cloudinary sync only for curated images in `notes/screenshots/`
- **W4**: Blog posts reference permanent Cloudinary URLs
- **W5**: Generated banners match series branding and include dynamic content (titles, dates)

## Decision

**We will implement a Cloudinary-based screenshot and image management solution** with the following architecture:

### **Architecture Overview:**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Source Images │    │   Curation      │    │   Cloudinary    │
│                 │    │   Process       │    │   CDN Hosting   │
│                 │    │                 │    │                 │
│ • E2E Tests     │───▶│ • Manual Review │───▶│ • Permanent     │
│ • Desktop       │    │ • Copy Selected │    │   URLs          │
│ • Mobile        │    │ • Organize by   │    │ • Auto Banners  │
│ • Screenshots   │    │   Date          │    │ • Transformations│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### **Implementation Components:**

#### **1. Curated Screenshot Workflow**
```typescript
// Manual curation process
src/target/screenshots/*.png  →  [MANUAL REVIEW]  →  notes/screenshots/2025-08-29/
desktop/Downloads/*.png       →  [MANUAL REVIEW]  →  notes/screenshots/2025-08-29/
mobile/photos/*.png          →  [MANUAL REVIEW]  →  notes/screenshots/2025-08-29/
```

#### **2. Cloudinary Service Layer**
```typescript
interface ScreenshotManager {
  uploadScreenshot(filePath: string, options: ScreenshotUploadOptions): Effect<string, Error>
  uploadCuratedScreenshots(dateFolder: string): Effect<Record<string, string>, Error>
  generateBlogBanner(options: BannerOptions): string
  generateSeriesCard(blogPost: BlogPost): string
}
```

#### **3. Automated Banner Generation**
- **Template System**: Consistent branding for "30-Day AI-Native Observability Platform" series
- **Dynamic Content**: Blog titles, subtitles, day numbers, and publication info
- **Multiple Formats**: Hero banners (1200x630), social cards (1200x630), thumbnails (400x300)

#### **4. URL Strategy**
```
Screenshots: https://res.cloudinary.com/dlm6bnmny/image/upload/screenshots/2025-08-29/claude-results.png
Banners:     https://res.cloudinary.com/dlm6bnmny/image/upload/w_1200,h_630,c_fill,b_gradient.../sample
Social:      https://res.cloudinary.com/dlm6bnmny/image/upload/w_1200,h_630,c_fill,l_text.../sample
```

## Rationale

### **Why Cloudinary Over Alternatives:**

| Solution | Pros | Cons | Decision |
|----------|------|------|----------|
| **GitHub Pages** | Free, integrated with repo | Limited to main branch, no banner generation | ❌ Rejected |
| **GitHub Raw URLs** | Simple, version controlled | Break with branch deletion, no transformations | ❌ Rejected |
| **AWS S3 + CloudFront** | Enterprise grade | Complex setup, no AI features | ❌ Rejected |
| **Cloudinary** | CDN + AI + API, banner generation | Paid service beyond free tier | ✅ **CHOSEN** |

### **Key Decision Factors:**
1. **Banner Generation**: Cloudinary's AI-powered image generation eliminates manual design work
2. **Permanent URLs**: CDN hosting ensures URLs never break
3. **Developer Experience**: Simple API integration with existing workflow
4. **Scalability**: Handles multiple image sources and formats automatically

### **Workflow Benefits:**
- **Quality Control**: Manual curation ensures only best screenshots are used
- **Efficiency**: Automated banner generation saves design time
- **Consistency**: Template system maintains brand consistency across blog series
- **Flexibility**: Supports multiple image sources (test, desktop, mobile)

## Implementation Plan

### **Phase 1: Core Infrastructure** (Current Sprint)
1. ✅ Create `ScreenshotManager` service with Cloudinary integration
2. ✅ Implement curated upload workflow for `notes/screenshots/YYYY-MM-DD/`
3. ✅ Create banner generation templates for blog series
4. ✅ Add GitHub Actions workflow for automated Cloudinary sync

### **Phase 2: Blog Integration** (Next Sprint)
1. Update all existing blog posts to use Cloudinary URLs
2. Generate series banners for all published blog posts
3. Create social media cards for Dev.to and Medium
4. Add automated banner generation to blog publishing workflow

### **Phase 3: Advanced Features** (Future)
1. Mobile-responsive image generation
2. A/B testing for banner designs
3. Automated social media posting with generated images
4. Integration with Claude Code agents for automated image creation

## Configuration

### **Environment Variables:**
```bash
CLOUDINARY_CLOUD_NAME=dlm6bnmny
CLOUDINARY_API_KEY=<secret>
CLOUDINARY_API_SECRET=<secret>
```

### **Directory Structure:**
```
notes/screenshots/
├── 2025-08-29/
│   ├── README.md                    # Documentation for the day's screenshots
│   ├── claude-results.png           # Curated model differentiation screenshots
│   ├── gpt-results.png
│   ├── llama-results.png
│   └── local-statistical-analyzer-results.png
├── 2025-08-30/
│   └── ...
└── templates/
    ├── blog-banner-template.md      # Banner generation guidelines
    └── social-card-template.md      # Social media card specs
```

### **Banner Templates:**
```typescript
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
```

## Consequences

### **Positive:**
- **Permanent URLs**: Blog posts and documentation have stable, external-accessible image references
- **Quality Control**: Manual curation ensures only best screenshots are published
- **Automated Design**: Banner generation eliminates manual design work and ensures consistency
- **Developer Efficiency**: Single workflow handles multiple image sources and destinations
- **Professional Appearance**: CDN hosting and optimized images improve blog presentation

### **Negative:**
- **Manual Step**: Requires developer time to review and curate screenshots
- **External Dependency**: Relies on Cloudinary service availability
- **Cost**: Paid service beyond free tier limits (current: 25GB storage, 25GB bandwidth/month)
- **Complexity**: Additional service to configure and maintain

### **Mitigations:**
- **Manual Curation**: Necessary for quality - automated uploads of all test screenshots would create noise
- **Service Risk**: Free tier sufficient for current needs, with upgrade path available
- **Backup Strategy**: Screenshots remain in version control as source of truth
- **Documentation**: Clear ADR and implementation docs for team knowledge transfer

## Implementation Notes

### **Curated Workflow Process:**
1. **Generate Screenshots**: E2E tests create screenshots in `target/screenshots/`
2. **Review Quality**: Developer examines all generated screenshots
3. **Select Best**: Copy highest-quality, most representative screenshots
4. **Organize**: Place selected screenshots in `notes/screenshots/YYYY-MM-DD/`
5. **Automatic Sync**: GitHub Actions uploads curated images to Cloudinary
6. **Reference URLs**: Blog posts use permanent Cloudinary URLs

### **Banner Generation Examples:**
```typescript
// Day 15 blog banner
const bannerUrl = screenshotManager.generateBanner({
  title: 'Day 15: Bulletproof CI/CD',
  subtitle: 'GitHub Actions Infrastructure Revolution',
  series: '30-Day AI-Native Observability Platform',
  template: 'technical'
})
// Result: https://res.cloudinary.com/dlm6bnmny/image/upload/w_1200,h_630,c_fill,b_rgb:0f172a/l_text:Arial_44_bold_center:Day%2015%253A%20Bulletproof%20CI%252FCD/fl_layer_apply,g_center,y_-20,co_white/sample
```

### **Integration Points:**
- **GitHub Actions**: Automated upload of curated screenshots on `notes/screenshots/**` changes
- **Blog Publishing**: Generated banners included in Dev.to and Medium posts
- **Documentation**: Screenshots referenced in README files and package documentation
- **PR Creation**: pr-creation-agent uses Cloudinary URLs for stable screenshot references

## Success Metrics

### **Quality Metrics:**
- Screenshot curation time: < 5 minutes per batch
- Banner generation time: < 30 seconds per blog post
- Image load times: < 2 seconds globally via CDN

### **Usage Metrics:**
- Number of curated screenshots per month
- Blog banner generation frequency
- Cloudinary bandwidth usage vs. free tier limits

### **Developer Experience:**
- Reduction in manual design work for blog posts
- Consistent branding across all blog series content
- Simplified screenshot workflow from test → curation → publication

---

**Related ADRs:**
- ADR-006: Automated Code-Documentation Alignment (screenshot integration)
- ADR-009: GitHub Actions Project Guardian Optimization (CI/CD workflows)

**External References:**
- [Cloudinary Image Transformations API](https://cloudinary.com/documentation/image_transformations)
- [30-Day AI-Native Observability Platform Blog Series](https://dev.to/clayroach/series/32969)