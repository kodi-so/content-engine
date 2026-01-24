# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Content Engine is a social media content automation platform for TikTok. Users create AI-generated carousel slideshows and schedule/automate posting to connected TikTok accounts.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS 4
- **Backend**: Convex (serverless backend with real-time sync)
- **Auth**: Clerk (integrated with Convex via ConvexProviderWithClerk)
- **AI**: Google Gemini (text generation + image generation via gemini-2.5-flash)
- **Routing**: React Router DOM v7

## Development Commands

```bash
# Start frontend dev server
npm run dev

# Start Convex backend (run in separate terminal)
npm run convex:dev

# Build for production
npm run build

# Deploy Convex functions
npm run convex:deploy
```

Both `npm run dev` and `npm run convex:dev` must run simultaneously for local development.

## Architecture

### Frontend (`src/`)

- `main.tsx` - App entry with Clerk + Convex providers
- `App.tsx` - Routes and sidebar navigation
- `pages/` - Route components (Home, Library, Slideshows, Analytics, Automations, Settings)
- `features/` - Feature modules with co-located components, hooks, types:
  - `slideshows/` - Slideshow generation and editing
  - `scheduling/` - Post scheduling UI
  - `automations/` - Automation configuration wizard
  - `analytics/` - TikTok metrics display

Feature modules export via barrel files (`index.ts`) with components, hooks, types, and utils.

### Backend (`convex/`)

- `schema.ts` - Database schema with tables: products, accounts, content, scheduledPosts, postedContent, automations, automationRuns
- `http.ts` - HTTP routes for TikTok OAuth callback and image proxy
- `crons.ts` - Scheduled jobs (post processing every 15min, TikTok sync hourly, automation runs)
- `providers/gemini.ts` - Gemini API wrapper for text + image generation
- `slideshows/generate.ts` - AI slideshow generation (text + images in single call)
- `tiktok.ts` - TikTok posting API integration
- `automations/` - Automation scheduling and execution

### Key Convex Patterns

- Mutations for writes, queries for reads, actions for external API calls
- Internal functions (`internal.*`) for cron jobs and cross-function calls
- Auth via `ctx.auth.getUserIdentity()` - returns user identity from Clerk JWT
- All user data filtered by `userId: identity.subject`

### TikTok Integration

- OAuth flow handled via HTTP endpoints in `http.ts`
- Images proxied through Convex site URL (TikTok requires verified domain)
- PNG images auto-converted to WebP for TikTok compatibility
- Photo posts require 2-35 images per carousel

## Environment Variables

Required in `.env.local` (frontend) and Convex dashboard (backend):

- `VITE_CONVEX_URL` / `VITE_CLERK_PUBLISHABLE_KEY` - Frontend
- `GEMINI_API_KEY` - AI generation
- `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` - TikTok OAuth
- `CONVEX_SITE_URL` / `FRONTEND_URL` - OAuth redirects

See `.env.example` for full list.

## Slideshow Data Model

Slides use flexible text elements (like Canva) with:
- `textElements[]` - Array of positioned text boxes with content, position (x,y %), size, fontSize, fontColor
- `imageUrl` - Background image stored in Convex storage
- `imagePrompt` - Prompt used to generate the image
- `overlay` - Boolean for text readability overlay

## Reference Images (User Library)

Users can upload reference images to their personal library for consistent visual identity across generations:

- `referenceImages` table - User's personal image library (max 20 images per user)
- Types: "character" (mascot), "person" (AI UGC persona), "logo", "style" (style reference)
- Each image has: `storageUrl`, `name`, `type`, `description` (optional instructions)

### Usage Flow

1. Upload images via Settings > Images tab
2. Select images when generating slideshows (in playground or automations)
3. Provide `characterInstructions` to guide how AI uses the references
4. Selected images are converted to base64 and passed to Gemini as `inlineData`

### API

- `referenceImages.list` / `referenceImages.add` / `referenceImages.remove` - Manage library
- `generateWithConfig({ referenceImageIds, characterInstructions, ... })` - Use in generation
- Automations store `referenceImageIds` and `characterInstructions` in their config

### Frontend Components

- `Settings.tsx` > ImagesTab - Upload and manage reference images
- `ReferenceImagePicker` - Reusable component for selecting images in generation forms
