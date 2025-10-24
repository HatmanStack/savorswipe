# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SavorSwipe is an Expo-based React Native mobile application that allows users to discover recipes through a swipe-based interface or search functionality. Users can swipe left to discard and right to view detailed recipe information, or use the search feature to find recipes by title or ingredients. The app also supports uploading recipe images that are processed through OCR.

## Common Commands

### Development
```bash
npm start              # Start Expo development server
npm run android        # Run on Android emulator/device
npm run ios            # Run on iOS simulator/device
npm run web            # Run in web browser
```

### Testing and Quality
```bash
npm test               # Run Jest tests in watch mode
npm run lint           # Run ESLint
```

### Project Reset
```bash
npm run reset-project  # Reset project to initial state
```

## Architecture

### Frontend Architecture (Expo/React Native)

**Routing**: Uses Expo Router with file-based routing:
- `app/index.tsx`: Main swipe interface (home screen)
- `app/search.tsx`: Search screen for finding recipes
- `app/recipe/[id].tsx`: Recipe detail page
- `app/_layout.tsx`: Root layout with navigation stack

**State Management**: Context-based architecture with simplified `RecipeContext` that manages:
- Recipe data (loaded from S3/CloudFront)
- Current recipe being displayed
- Meal type filters

Image queue and preloading are now handled by the `useImageQueue` hook (see Swipe Library Architecture below).

**Key Data Flow**:
1. `useImageQueue` hook manages a 10-15 image prefetch queue for instant swiping
2. Images are fetched from CloudFront-fronted S3 bucket in batches of 5
3. Recipe metadata stored in `jsondata/combined_data.json` on S3
4. Recipe images stored in `images/*.jpg` on S3
5. Swipe gestures trigger navigation (right = view recipe, left = next image with animation)

### Service Layer

**RecipeService** (`services/RecipeService.ts`):
- Fetches recipe data from S3 via CloudFront
- Filters recipes by meal type
- Handles recipe randomization and shuffling
- Manages recipe uploads for OCR processing

**ImageService** (`services/ImageService.ts`):
- Fetches images from S3/CloudFront
- Converts between recipe keys and image filenames
- Processes images for upload
- Returns blob URLs for efficient image handling

**ImageQueueService** (`services/ImageQueueService.ts`):
- Batch fetches 5 images at a time using Promise.all()
- Determines when queue needs refilling (threshold: 8 images)
- Cleans up blob URLs to prevent memory leaks
- Creates shuffled recipe key pool from filtered data

**SearchService** (`services/SearchService.ts`):
- Client-side search across all recipe data
- Case-insensitive partial matching for titles and ingredients
- Handles flexible ingredient formats (string, array, object, nested objects)
- Returns filtered array of matching recipes

**SearchStorageService** (`services/SearchStorageService.ts`):
- Manages recent search queries in AsyncStorage
- Stores up to 10 recent searches with timestamps
- Deduplicates searches and sorts by recency
- Handles storage errors gracefully

### Search Architecture

**Search Screen** (`app/search.tsx`):
- Accessible from hamburger menu via "Search Recipes" option
- Searches recipe titles and ingredients in real-time
- 300ms debouncing for optimal performance
- Recent searches stored locally in AsyncStorage (max 10)
- List view of results with tap-to-view navigation
- Empty state with helpful suggestions when no results found

**Search Components**:
- `SearchInput` (`components/SearchInput.tsx`): Debounced text input with clear button and auto-focus
- `SearchResultsList` (`components/SearchResultsList.tsx`): FlatList of matching recipes with performance optimizations
- `SearchResultItem` (`components/SearchResultItem.tsx`): Individual result card showing recipe image, title, and brief info
- `RecentSearches` (`components/RecentSearches.tsx`): Quick access to recent queries with clear all functionality
- `SearchEmptyState` (`components/SearchEmptyState.tsx`): Helpful suggestions and popular ingredients when no results

**Search Data Flow**:
1. User opens hamburger menu → taps "Search Recipes"
2. Search screen displays with auto-focused input and recent searches
3. User types query → debounced update after 300ms
4. SearchService filters jsonData by matching title or ingredients
5. Results displayed in scrollable list with recipe images
6. User taps result → navigates to recipe detail page (`/recipe/[recipeKey]`)
7. Query saved to recent searches (AsyncStorage) when results found

**Search Implementation Details**:
- Ignores meal type filters (searches all recipes)
- Empty queries show recent searches instead of results
- Handles all ingredient formats through recursive text extraction
- Case-insensitive with partial match support
- Special characters (e.g., "jalapeño") handled correctly
- Recent search deduplication based on query string

### Swipe Library Architecture

The swipe interface uses a prefetch queue system for instant recipe browsing.

**useImageQueue Hook** (`hooks/useImageQueue.ts`):
- Manages queue of 10-15 prefetched recipe images
- Exposes currentImage, nextImage, advanceQueue()
- Automatically refills queue when it drops to 8 images
- Handles filter changes by resetting queue
- Cleans up blob URLs on unmount to prevent memory leaks

**ImageQueueService** (`services/ImageQueueService.ts`):
- Batch fetches 5 images at a time using Promise.all()
- Determines when queue needs refilling
- Cleans up blob URLs to prevent memory leaks
- Creates shuffled recipe key pool from filtered data

**Home Screen** (`app/index.tsx`):
- Consumes useImageQueue hook
- Displays dual image layers for smooth animation
- Handles swipe gestures (left = next, right = detail)
- Animates transitions with 100ms slide effect

**Data Flow**:
1. User opens app → hook initializes → fetches 3 batches of 5 images in parallel
2. User swipes left → animation plays → advanceQueue() shifts queue
3. Queue drops to 8 → automatic refill fetches next batch of 5
4. User changes filters → resetQueue() clears and reinitializes

**Configuration**:

Queue behavior is configured in `ImageQueueService.CONFIG`:
- `INITIAL_QUEUE_SIZE`: 15 images
- `REFILL_THRESHOLD`: 8 images (trigger point)
- `BATCH_SIZE`: 5 images per fetch
- `MIN_QUEUE_SIZE`: 3 images (minimum before blocking)
- `ANIMATION_DURATION`: 100ms

**Performance**:
- Images fetch in parallel (5 at a time)
- Blob URLs are revoked when images leave queue
- Queue maintains steady state of 10-15 images
- Background refilling doesn't block UI

### Type System

Core types defined in `types/index.ts`:

**Recipe Structure**: Flexible schema supporting multiple formats:
- `Ingredients`: Can be string, string[], flat object (ingredient:amount), or nested object with sections
- `Directions`: Same flexible structure as Ingredients
- `Type`: Single or array of MealType ('main dish', 'dessert', 'appetizer', 'breakfast', 'side dish', 'beverage')

**Important**: Recipe data supports both simple formats (arrays/strings) and complex structured formats (nested objects with sections). The `Recipe` component handles all variations.

### Backend Architecture (AWS Lambda)

Located in `backend/` directory (Python):

**Lambda Function** (`lambda_function.py`):
- Accepts base64-encoded images or PDFs
- Processes uploads through OCR (OpenAI Vision API)
- Searches for recipe images via Google Custom Search
- Uploads processed data and images to S3
- Returns processed recipe JSON and search image

**OCR Processing** (`ocr.py`):
- Extracts recipe data from images using OpenAI Vision
- Parses and structures recipe information
- Handles multi-page PDFs

**Image Search** (`search_image.py`):
- Uses Google Custom Search JSON API to find recipe images

### Multi-File Upload Architecture

**Overview**:
- Multi-file support for images (JPG, PNG) and PDFs
- Background processing (non-blocking) using job queue system
- Semantic duplicate detection using OpenAI embeddings (cosine similarity)
- Race condition protection with S3 ETag-based optimistic locking
- Automatic queue injection for instant recipe availability

**Upload Flow**:
1. **Frontend**: User selects multiple files → UploadService creates job → returns immediately (non-blocking)
2. **Background Processing**: Job queue processes sequentially → batch uploads to Lambda → per-job notifications
3. **Backend**: Parallel OCR (3 workers) → embedding generation → duplicate check (0.85 threshold) → atomic S3 write with retry
4. **Queue Injection**: Auto-detect new recipes in RecipeContext → fetch images → inject at position 2 → retry logic for S3 eventual consistency

**Key Components**:

**UploadService** (`services/UploadService.ts`):
- Job queue manager with sequential processing
- Batch management (10 files per Lambda call)
- Progress tracking per job (completed, failed counts)
- Subscriber pattern for status notifications
- Per-job chunk tracking for large PDFs
- AsyncStorage persistence for long uploads

**UploadPersistence** (`services/UploadPersistence.ts`):
- Persists upload queue state to AsyncStorage
- Restores state on app reopen
- Checks S3 for completion flags
- Keeps 10 recent completed jobs + all pending

**EmbeddingStore** (`backend/embeddings.py`):
- S3 storage with ETag-based optimistic locking
- Prevents race conditions during concurrent uploads
- Retry logic for S3 eventual consistency (3 attempts)

**DuplicateDetector** (`backend/duplicate_detector.py`):
- Cosine similarity comparison (threshold: 0.85)
- Returns most similar recipe key and score
- Prevents duplicate recipe entries

**ErrorDetailModal** (`components/ErrorDetailModal.tsx`):
- Tappable toast opens detailed error view
- Displays file number, recipe title, failure reason
- Scrollable for multiple errors

**Toast** (`components/Toast.tsx`):
- Internal notification queue
- Sequential display (one at a time)
- 5-second duration per message
- Per-job completion notifications

**useImageQueue Hook** (queue injection):
- Detects new recipes in `jsonData` via key comparison
- Fetches images with retry logic (3 attempts, 1s backoff)
- Injects at position 2 in queue
- Enforces max queue size (30 images)

**Data Storage**:
- **S3 Structure**:
  - `jsondata/combined_data.json`: All recipe metadata
  - `jsondata/recipe_embeddings.json`: 1536-dimensional vectors for duplicate detection
  - `images/*.jpg`: Recipe images
  - `upload-status/*.json`: Completion flags for background jobs (7-day retention)
- **Embedding Format**: `{ "recipe_key": [float × 1536] }`
- **Atomic Writes**: ETag-based conditional writes prevent race conditions

**Job Queue System**:
- Multiple uploads queue with pending status
- Sequential processing (one Lambda invocation at a time)
- Per-job start notification: "Upload 1 of 3 started..."
- Per-job completion: "Upload 2 complete: 5 recipes added, 2 failed"
- State persists to AsyncStorage (survives app closure)
- Completion flag checking on app reopen

**PDF Processing**:
- Auto-chunking: Large PDFs split into 20-page chunks
- Chunk-level progress: "Processing chunk 3 of 5..."
- Each chunk processed separately (enables unlimited pages)
- ~6 minutes per 20-page chunk with 3 parallel workers

**Configuration**:
- **Lambda**: 600s timeout, 1024 MB memory, 3 parallel workers (ThreadPoolExecutor)
- **Batch Size**: 10 files per Lambda call (20 recipes max with 3 workers)
- **Queue Size**: Max 30 images (prevents memory leaks)
- **OpenAI Timeout**: 30s per OCR request
- **Duplicate Threshold**: 0.85 cosine similarity
- **Retry Logic**: 3 attempts with exponential backoff (S3 eventual consistency)
- **Image Size Limit**: 10MB max (oversized files skipped with notification)

**Error Handling**:
- **Error Types**: OCR failure, duplicate detected, image upload failure, network error, invalid file format
- **User Feedback**: Toast with "Tap to view X errors" → ErrorDetailModal with detailed list
- **Retry Logic**: Automatic retries for S3 operations, network timeouts
- **Partial Success**: Jobs complete with mix of success/failure, clear reporting

**Testing**:
- **Backend**: 69 unit tests across 6 modules
- **Frontend**: 50+ unit tests (UploadService, UploadPersistence, UI components)
- **Integration**: 8 end-to-end scenarios (see `__tests__/integration/upload-flow.test.ts`)
- **Manual**: 10 QA scenarios (see `docs/testing/manual-upload-testing.md`)

**Performance**:
- **Single image**: ~5-10s (OCR + embedding + image search)
- **5 images**: ~20-30s (parallel processing with 3 workers)
- **10 images**: ~40-60s
- **20-page PDF**: ~6 minutes (parallel processing)
- **100-page cookbook**: ~30 minutes (5 sequential chunks)

**Known Limitations**:
- Processing time: ~53 seconds per recipe (OCR + embedding + image search)
- Lambda timeout: 10 minutes (limits ~11 recipes per batch with 3 workers)
- Recommended: 2-3 PDF chunks per upload batch to avoid timeout
- S3 eventual consistency may delay image availability (retry logic handles this)
- Concurrent uploads queue sequentially (prevents race conditions)
- Embedding storage uses single JSON file (acceptable up to ~10,000 recipes)

**Image URL Deduplication**:
- Google Image Search returns top 10 results
- Extracts all existing image URLs from `combined_data.json`
- Selects first unused URL from results
- Prevents same image on different recipes
- Falls back to first result if all used (rare)

**S3 Completion Flags**:
- Lambda writes `/upload-status/{job-id}.json` on completion
- Contains: success count, failure count, new recipe keys, errors, timestamp
- Frontend checks for flags on app mount/resume
- Shows missed completion toasts when reopening
- 7-day auto-cleanup policy

### Environment Configuration

Frontend requires `.env` with:
```
EXPO_PUBLIC_CLOUDFRONT_BASE_URL=<cloudfront distribution URL>
EXPO_PUBLIC_LAMBDA_FUNCTION_URL=<lambda function URL>
```

Backend Lambda requires:
```
API_KEY=<OpenAI API key>
SEARCH_ID=<Google Custom Search engine ID>
SEARCH_KEY=<Google Custom Search API key>
AWS_S3_BUCKET=<S3 bucket name>
```

## Key Technical Details

### Image Queue Management

The app maintains a 3-image queue for smooth UX:
1. `GetImages` component manages queue lifecycle
2. When queue drops below 3 images, new list is shuffled
3. When queue exceeds 40 images, refetch is disabled (app/index.tsx:39-44)
4. Images are prefetched and stored in `fetchedFilesRef` before display

### Swipe Gesture Handling

Gestures are debounced (100ms) to prevent rapid swipes (app/index.tsx:59-67):
- Left swipe (< -30px): Load next image
- Right swipe (> 30px): Navigate to recipe detail page
- Uses `react-native-gesture-handler` for smooth animations

### Recipe Rendering Complexity

The `Recipe` component (components/Recipe.tsx) handles multiple data formats:
- Flat vs. nested structures for Ingredients/Directions
- Section-based grouping (e.g., "For the Crust", "For the Filling")
- Array vs. object vs. string formats
- Unicode decoding for special characters

### Known Issues and TODOs

- `startImage` state in RecipeContext is a workaround for conditional rendering issues (context/RecipeContext.tsx:14-15, 32)
- Consider splitting RecipeContext into focused contexts (RecipeDataContext, ImageContext, FilterContext) as outlined in types/index.ts:69-92

### Testing

Test files located in `components/__tests__/` and `services/__tests__/`:
- Uses Jest with jest-expo preset
- React Native Testing Library for component tests
- Path alias `@/*` configured for imports
- 46 tests total (as of search feature implementation):
  - 13 SearchService tests (all ingredient formats, edge cases)
  - 7 SearchStorageService tests (AsyncStorage operations)
  - 4 SearchInput tests (debouncing, clear button)
  - 5 SearchResultsList tests (rendering, navigation)
  - 4 SearchResultItem tests (image fallback, press handling)
  - 3 RecentSearches tests (display, clear functionality)
  - 6 SearchEmptyState tests (suggestions, empty states)
  - Additional tests for existing components

## Infrastructure Notes

**Storage**: AWS S3 bucket with two folders:
- `/images`: Recipe photos (.jpg)
- `/jsondata`: Recipe metadata (combined_data.json)

**CDN**: CloudFront distribution fronts S3 bucket for performance

**Processing**: AWS Lambda function handles OCR, image search, and S3 uploads
