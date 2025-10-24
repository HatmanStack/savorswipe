# Manual Testing Guide: Multi-File Recipe Upload

This guide provides comprehensive manual testing scenarios for QA validation of the multi-file recipe upload feature.

## Section 1: Prerequisites

### Required Test Files
Prepare the following test files before beginning (see `test-assets/README.md` for details):

- **5 recipe images**: Various formats (JPG, PNG), sizes, and qualities
- **2 recipe PDFs**: One with 3 recipes, one with 1 recipe
- **1 duplicate file**: Copy of an existing recipe for duplicate detection testing

### Environment Setup

1. **Expo Development Server**:
   ```bash
   npm start
   ```

2. **Mobile Device or Emulator**:
   - iOS Simulator (for Mac)
   - Android Emulator
   - Physical device with Expo Go app

3. **Network Connection**:
   - Stable internet connection required
   - Lambda backend URL configured in `.env`
   - S3 bucket accessible

4. **Test Account Preparation**:
   - Clear app data/cache before starting
   - Ensure AsyncStorage is empty (fresh install)
   - Note current recipe count in app

### Pre-Test Verification

- [ ] Lambda function is deployed and responding
- [ ] S3 bucket has read/write permissions
- [ ] CloudFront distribution is serving images
- [ ] Test files are prepared and ready
- [ ] Device has sufficient storage space
- [ ] App builds and launches successfully

---

## Section 2: Test Scenarios

### Scenario 1: Single File Upload

**Objective**: Verify basic single-image upload functionality

**Steps**:
1. Launch the app and navigate to the swipe screen
2. Tap the hamburger menu (☰) in the top-left corner
3. Select "Upload Recipe" from the menu
4. Tap "Select Files" button in the upload modal
5. Choose **one image file** (test-recipe-1.jpg)
6. Verify file preview appears in the modal
7. Tap "Upload" button
8. Observe modal closes immediately

**Expected Behavior**:
- Modal closes within 100ms after tapping "Upload"
- Toast notification appears after 5-15 seconds: "1 recipe added successfully!"
- Swipe forward 1-3 times to find the new recipe
- Recipe appears with correct title, ingredients, and directions
- Recipe image matches the uploaded file

**Verification Checklist**:
- [ ] Upload modal closed immediately
- [ ] Toast appeared with success message
- [ ] New recipe appears in swipe queue within 5 swipes
- [ ] Recipe data is accurate (title, ingredients, directions)
- [ ] Recipe image loaded correctly
- [ ] No duplicate recipes created

**Time Benchmark**: ~5-10 seconds from upload to toast

---

### Scenario 2: Multiple Images Upload

**Objective**: Test batch upload of multiple image files

**Steps**:
1. Open upload modal
2. Tap "Select Files"
3. Select **5 image files** at once (test-recipe-1 through test-recipe-5)
4. Verify all 5 thumbnails appear in modal
5. Tap "Upload"
6. Wait for completion toast

**Expected Behavior**:
- All 5 files show previews before upload
- Upload modal closes immediately
- Toast appears: "All 5 recipes added successfully!"
- All 5 recipes appear in queue within next 10 swipes
- Each recipe has unique content
- No duplicates created

**Verification Checklist**:
- [ ] All 5 files selected successfully
- [ ] Modal closed immediately after upload
- [ ] Toast showed "5 recipes" message
- [ ] All 5 recipes findable in swipe queue
- [ ] Each recipe has correct data
- [ ] No errors or failures occurred

**Time Benchmark**: ~20-30 seconds from upload to toast

---

### Scenario 3: PDF Upload (Multi-Recipe)

**Objective**: Verify PDF processing extracts multiple recipes correctly

**Steps**:
1. Open upload modal
2. Tap "Select Files"
3. Choose the **PDF with 3 recipes** (test-cookbook-3recipes.pdf)
4. Verify PDF filename appears in modal
5. Tap "Upload"
6. Wait for completion

**Expected Behavior**:
- PDF file appears in preview (may show icon vs thumbnail)
- Upload initiates successfully
- Toast notification: "3 recipes added successfully!"
- All 3 recipes extracted as separate entries
- Each recipe has a Google-searched image (not from PDF)
- Recipes appear in swipe queue

**Verification Checklist**:
- [ ] PDF file accepted and previewed
- [ ] Upload completed without errors
- [ ] Toast indicated 3 recipes (not 1)
- [ ] Found all 3 recipes in swipe queue
- [ ] Each recipe has unique Google image
- [ ] Recipe data accurate for all 3

**Time Benchmark**: ~15-25 seconds for 3-recipe PDF

---

### Scenario 4: Mixed Upload (Images + PDFs)

**Objective**: Test uploading both images and PDFs in one batch

**Steps**:
1. Open upload modal
2. Tap "Select Files"
3. Select **3 images + 1 PDF (2 recipes)** = 5 total recipes
   - test-recipe-1.jpg
   - test-recipe-2.jpg
   - test-recipe-3.png
   - test-cookbook-3recipes.pdf (contains 2 recipes for this test)
4. Verify all files shown in modal
5. Tap "Upload"
6. Wait for completion

**Expected Behavior**:
- Modal shows both image thumbnails and PDF icon
- Toast notification: "5 recipes added successfully!"
- All 5 recipes (3 images + 2 from PDF) appear in queue
- Images use uploaded photos
- PDF recipes use Google-searched images

**Verification Checklist**:
- [ ] Mixed file types accepted
- [ ] All files previewed correctly
- [ ] Upload succeeded for all files
- [ ] Total recipe count matches expectation
- [ ] Image recipes have uploaded photos
- [ ] PDF recipes have Google images
- [ ] No processing errors

**Time Benchmark**: ~25-35 seconds for mixed batch

---

### Scenario 5: Duplicate Detection

**Objective**: Verify duplicate recipes are rejected

**Steps**:
1. Upload test-recipe-1.jpg successfully (if not already uploaded)
2. Wait for completion and verify recipe appears
3. Open upload modal again
4. Select **duplicate-recipe.jpg** (copy of test-recipe-1.jpg)
5. Tap "Upload"
6. Wait for completion toast

**Expected Behavior**:
- Upload processes normally
- Toast notification: "0 of 1 recipes added. Tap to view 1 error."
- Toast is tappable
- Tapping toast opens Error Detail Modal
- Error message shows: "Duplicate of recipe_X (similarity: 0.XX)"
- Original recipe remains, no duplicate created

**Verification Checklist**:
- [ ] Duplicate detected during processing
- [ ] Toast indicated 0 recipes added
- [ ] Toast showed "Tap to view" message
- [ ] Error modal opened when toast tapped
- [ ] Error message clearly indicates duplicate
- [ ] Similarity score displayed (0.85-1.00)
- [ ] No duplicate recipe in queue

**Time Benchmark**: ~5-10 seconds (duplicate check is fast)

---

### Scenario 6: Background Processing

**Objective**: Confirm uploads don't block UI interactions

**Steps**:
1. Open upload modal
2. Select **10 image files**
3. Tap "Upload" and note the time
4. **Immediately start swiping** through recipes
5. Continue swiping for 30-60 seconds
6. Watch for completion toast to appear during swiping

**Expected Behavior**:
- Upload modal closes immediately
- Swiping works smoothly and responsively
- No UI lag or freezing during upload
- Toast appears mid-swipe (doesn't block interaction)
- Can continue swiping after toast appears
- New recipes auto-inject into queue

**Verification Checklist**:
- [ ] Swipe gestures responsive during upload
- [ ] No UI freezing or lag
- [ ] Toast appeared without blocking swipes
- [ ] App remained fully interactive
- [ ] Upload completed in background
- [ ] New recipes injected automatically

**Time Benchmark**: ~40-60 seconds for 10 files

---

### Scenario 7: Network Failure

**Objective**: Test error handling when network is unavailable

**Steps**:
1. **Disable WiFi** on device
2. Open upload modal
3. Select 1-2 images
4. Tap "Upload"
5. Wait for error response
6. **Re-enable WiFi**
7. Retry upload with same files

**Expected Behavior**:
- Upload attempts to process
- Toast notification: "Upload failed" or "All X recipes failed"
- Error message indicates network issue
- After WiFi restored, retry succeeds normally
- No partial data corruption

**Verification Checklist**:
- [ ] Network error detected
- [ ] User-friendly error message shown
- [ ] Toast indicated failure clearly
- [ ] App didn't crash
- [ ] Retry after WiFi restore succeeded
- [ ] No data corruption occurred

**Time Benchmark**: Immediate error on network failure

---

### Scenario 8: Large Batch Upload

**Objective**: Verify system handles large batches efficiently

**Steps**:
1. Prepare **15 recipe images** (mix of test files)
2. Open upload modal
3. Select all 15 files
4. Verify all 15 thumbnails appear
5. Tap "Upload"
6. Note start time
7. Wait for completion toast
8. Note end time and calculate duration

**Expected Behavior**:
- All 15 files selected and previewed
- Upload initiates without errors
- Processing takes 30-90 seconds
- No timeout errors
- Toast: "All 15 recipes added successfully!"
- All 15 recipes eventually appear in queue

**Verification Checklist**:
- [ ] All 15 files accepted
- [ ] No memory warnings
- [ ] Upload completed without timeout
- [ ] Toast indicated all 15 added
- [ ] All recipes findable in queue
- [ ] Processing time within benchmark
- [ ] No recipes dropped or lost

**Time Benchmark**: ~60-90 seconds for 15 files

---

### Scenario 9: Filter Interaction

**Objective**: Test upload behavior with active meal type filters

**Steps**:
1. Open filter menu and select **only "Dessert"**
2. Upload **3 recipes** of mixed types:
   - 1 dessert recipe
   - 1 main dish recipe
   - 1 appetizer recipe
3. Wait for upload completion
4. Swipe through queue (should only see desserts)
5. Open filter menu and select **"All"**
6. Swipe again to find other uploaded recipes

**Expected Behavior**:
- All 3 recipes added to master data
- Toast: "3 recipes added successfully!"
- With "Dessert" filter: only dessert recipe appears in queue
- After selecting "All": all 3 uploaded recipes visible
- Filters work correctly with new recipes

**Verification Checklist**:
- [ ] All 3 recipes processed
- [ ] Filter applied to uploaded recipes
- [ ] Only matching recipe in filtered queue
- [ ] Changing filter reveals other recipes
- [ ] No recipes lost due to filtering
- [ ] Filter state persisted correctly

**Time Benchmark**: ~15-25 seconds for 3 files

---

### Scenario 10: Queue Position

**Objective**: Verify new recipes inject at correct queue position

**Steps**:
1. Start swiping and **note current recipe**
2. Swipe forward exactly **2 times**
3. Without swiping further, open upload modal
4. Upload **3 new recipes**
5. Wait for completion toast
6. Swipe forward **once** (to position 3)
7. **Verify one of the new recipes appears**
8. Continue swiping to find all new recipes within next few swipes

**Expected Behavior**:
- New recipes inject at position 2 (or thereabouts)
- Current swipe position not disrupted
- New recipes appear within next 3-5 swipes
- Swipe queue order maintained
- No recipes lost or duplicated

**Verification Checklist**:
- [ ] Upload completed while mid-swipe
- [ ] Current recipe didn't change unexpectedly
- [ ] New recipes found at position 2-4
- [ ] All 3 new recipes located
- [ ] Queue order makes sense
- [ ] No disruption to swipe experience

**Time Benchmark**: ~15-25 seconds for 3 files

---

## Section 3: Performance Benchmarks

These benchmarks help identify performance regressions:

| Scenario | Target Time | Max Acceptable | Notes |
|----------|-------------|----------------|-------|
| 1 image | < 10s | 15s | OCR + embedding + image search |
| 5 images | < 30s | 45s | Parallel processing with 3 workers |
| 10 images | < 60s | 90s | May hit Lambda concurrency limits |
| 15 images | < 90s | 120s | Close to Lambda timeout threshold |
| PDF (3 recipes) | < 25s | 40s | Includes multi-recipe extraction |
| Duplicate check | < 10s | 15s | Fast similarity comparison |

**If times exceed "Max Acceptable":**
- Check Lambda logs for errors
- Verify OpenAI API response times
- Check S3 upload speeds
- Review network connectivity

---

## Section 4: Edge Cases

### Edge Case 1: Empty/Invalid Files
**Test**: Upload a corrupt image or empty PDF
**Expected**: Error message "Invalid file format" or "OCR failed"

### Edge Case 2: OCR Failure
**Test**: Upload an image with no text or unreadable text
**Expected**: Error indicating OCR couldn't extract recipe data

### Edge Case 3: All Failures Scenario
**Test**: Upload 5 files that all fail (corrupted, duplicates, etc.)
**Expected**: Toast: "0 of 5 recipes added. Tap to view 5 errors."

### Edge Case 4: Concurrent Uploads
**Test**: Tap "Upload" on two different devices simultaneously
**Expected**: Job queue handles both, processes sequentially

### Edge Case 5: Very Large Image
**Test**: Upload a 20MB high-resolution image
**Expected**: Processing may take longer, but should complete or fail gracefully

### Edge Case 6: App Backgrounding
**Test**: Upload 10 files, then immediately background the app
**Expected**: Upload continues in background, toast appears when app reopened

### Edge Case 7: Mixed Success/Failure
**Test**: Upload batch with some valid, some corrupt files
**Expected**: Valid files succeed, corrupt files fail with specific errors

---

## Section 5: Error Detail Testing

### Error Modal Display
1. Upload a batch with at least 2 failures
2. Wait for completion toast
3. **Tap the toast notification**
4. Verify Error Detail Modal opens

### Error Modal Content
Verify the modal shows:
- [ ] Title: "Upload Errors"
- [ ] Clear list of failed files
- [ ] Each error shows:
  - File number (e.g., "File 3")
  - Recipe title (if extracted)
  - Reason for failure
- [ ] Close button works
- [ ] Modal scrollable for many errors

### Error Modal Interaction
- [ ] Tapping outside modal doesn't close it
- [ ] Close button closes modal
- [ ] Errors are clearly readable
- [ ] No truncated messages

---

## Section 6: Issue Reporting Template

When reporting issues found during manual testing, use this template:

```markdown
### Issue Title: [Brief description]

**Scenario**: [Which test scenario from this guide]

**Steps to Reproduce**:
1.
2.
3.

**Expected Behavior**:
[What should happen according to the guide]

**Actual Behavior**:
[What actually happened]

**Screenshots/Logs**:
[Attach relevant images or console output]

**Device Information**:
- Device: [iPhone 14, Pixel 6, etc.]
- OS Version: [iOS 17.1, Android 13, etc.]
- Expo Version: [From package.json]
- App Version: [From package.json]

**Additional Context**:
[Network conditions, specific files used, etc.]

**Severity**:
- [ ] Critical (blocks testing)
- [ ] High (major feature broken)
- [ ] Medium (workaround available)
- [ ] Low (minor issue)
```

---

## Section 7: Test Completion Checklist

After completing all scenarios, verify:

### Functional Testing
- [ ] All 10 scenarios completed
- [ ] All 7 edge cases tested
- [ ] Error modal verified
- [ ] Performance within benchmarks
- [ ] No crashes or freezes observed

### Data Integrity
- [ ] All uploaded recipes appear correctly
- [ ] No duplicate recipes created
- [ ] No data corruption
- [ ] Filters work with new recipes
- [ ] Recipe images load correctly

### User Experience
- [ ] Upload process is intuitive
- [ ] Error messages are clear
- [ ] Toast notifications are helpful
- [ ] App remains responsive
- [ ] Queue injection feels natural

### Edge Cases
- [ ] Network failures handled gracefully
- [ ] Invalid files rejected properly
- [ ] Duplicate detection works
- [ ] Large batches complete successfully
- [ ] Concurrent uploads don't conflict

### Documentation
- [ ] All issues logged with template
- [ ] Screenshots captured where relevant
- [ ] Performance times recorded
- [ ] Test results shared with team

---

## Appendix: Quick Reference

### Common Commands
```bash
# Start app
npm start

# Clear cache
npm start -- --reset-cache

# View logs
npx expo start --android --no-dev --minify
```

### Expected Toast Messages
- Success (all): "All X recipes added successfully!"
- Success (partial): "X of Y recipes added. Tap to view Z errors."
- Failure (all): "0 of X recipes added. Tap to view X errors."
- Duplicate: "0 of 1 recipes added. Tap to view 1 error."
- Network error: "Upload failed"

### Troubleshooting
- **No toast appears**: Check Lambda logs, verify network connection
- **OCR fails**: Ensure image has clear, readable text
- **Duplicate not detected**: Check embedding similarity threshold (0.85)
- **Queue injection fails**: Verify RecipeContext updates, check image fetching
- **Performance slow**: Check OpenAI API status, Lambda cold starts

---

**Document Version**: 1.0
**Last Updated**: October 23, 2025
**Prepared for**: SavorSwipe Multi-File Upload Feature (Phase 3)
