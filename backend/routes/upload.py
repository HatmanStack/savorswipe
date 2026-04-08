"""POST /recipe/upload + async-invoke pipeline."""

from __future__ import annotations

import json
import os
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional, Tuple

from config import PDF_MAX_PAGES
from logger import get_logger
from services.recipe_completeness import merge_incomplete_recipes

log = get_logger("routes.upload")


def _lf():
    """Lazy access to the lambda_function module (avoids circular imports)."""
    import lambda_function  # noqa: PLC0415

    return lambda_function


# Backwards-compat alias used by tests that monkeypatch ``upload_route.lf.X``.
class _LFProxy:
    def __getattr__(self, name):
        return getattr(_lf(), name)

    def __setattr__(self, name, value):
        setattr(_lf(), name, value)


lf = _LFProxy()

# Per-recipe wall-clock budget for the parallel-processing stage.
RECIPE_BUDGET_SECONDS = float(os.getenv("RECIPE_BUDGET_SECONDS", "90"))

# Maximum payload bytes allowed for the self-invoke async Event payload.
# Lambda's hard async limit is 256 KB; we stay well under with headroom.
MAX_ASYNC_PAYLOAD_BYTES = int(os.getenv("MAX_ASYNC_PAYLOAD_BYTES", "200000"))


def process_single_recipe(
    recipe_data: Dict,
    embedding_generator,
    duplicate_detector,
) -> Tuple[Optional[Dict], Optional[List[float]], Optional[List[str]], Optional[str]]:
    """
    Generate embedding, dedupe, fetch image candidates for one recipe.

    Returns ``(recipe, embedding, search_results[0:9], error)``.
    """
    try:
        title = recipe_data.get("Title", "Unknown Recipe")
        recipe_type = recipe_data.get("Type")
        type_str = None
        if isinstance(recipe_type, list) and len(recipe_type) > 0:
            type_str = recipe_type[0]
        elif isinstance(recipe_type, str):
            type_str = recipe_type

        embedding = embedding_generator.generate_recipe_embedding(recipe_data)
        is_duplicate, duplicate_key, similarity_score = duplicate_detector.is_duplicate(embedding)
        if is_duplicate:
            return (
                None,
                None,
                None,
                f"Duplicate of recipe {duplicate_key} (similarity: {similarity_score:.2f})",
            )

        all_search_results = lf.si.google_search_image(title, count=10, recipe_type=type_str)
        search_results = all_search_results[0:9]
        return recipe_data, embedding, search_results, None
    except Exception as e:
        return None, None, None, f"Processing failed: {str(e)}"


def handle_post_request(event, context):
    """Accept upload, persist payload to S3, async-invoke worker."""
    try:
        body_content = event.get("body")
        body = json.loads(body_content) if body_content else event
    except json.JSONDecodeError as e:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"returnMessage": f"Invalid JSON in request body: {str(e)}"}),
        }

    if "files" not in body:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"returnMessage": "No files provided in request"}),
        }

    files = body["files"]
    job_id = body.get("jobId", str(uuid.uuid4()))
    log.info("Received upload request", job_id=job_id, file_count=len(files))

    bucket_name = os.getenv("S3_BUCKET")
    if not bucket_name:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"returnMessage": "S3_BUCKET environment variable not set"}),
        }

    # Validate FUNCTION_NAME and payload size BEFORE any S3 write so failures
    # cannot leak upload-pending blobs that lifecycle will still bill for.
    function_name = os.getenv("FUNCTION_NAME")
    if not function_name:
        log.error("FUNCTION_NAME env var missing; refusing to queue async invoke")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "success": False,
                    "error": "FUNCTION_NAME environment variable not set",
                }
            ),
        }

    serialized_body = json.dumps(body)
    payload_bytes = len(serialized_body.encode("utf-8"))
    if payload_bytes > MAX_ASYNC_PAYLOAD_BYTES:
        log.error(
            "Upload payload too large for async invoke",
            job_id=job_id,
            payload_bytes=payload_bytes,
            limit=MAX_ASYNC_PAYLOAD_BYTES,
        )
        return {
            "statusCode": 413,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "success": False,
                    "error": (
                        f"Upload payload {payload_bytes} bytes exceeds async limit "
                        f"{MAX_ASYNC_PAYLOAD_BYTES}"
                    ),
                }
            ),
        }

    try:
        s3_client = lf.S3
        lambda_client = lf.LAMBDA

        pending_key = f"upload-pending/{job_id}.json"
        s3_client.put_object(
            Bucket=bucket_name,
            Key=pending_key,
            Body=serialized_body,
            ContentType="application/json",
        )

        status_data = {
            "jobId": job_id,
            "status": "processing",
            "timestamp": int(time.time()),
            "totalFiles": len(files),
            "successCount": 0,
            "failCount": 0,
        }
        s3_client.put_object(
            Bucket=bucket_name,
            Key=f"upload-status/{job_id}.json",
            Body=json.dumps(status_data),
            ContentType="application/json",
        )

        lambda_client.invoke(
            FunctionName=function_name,
            InvocationType="Event",
            Payload=json.dumps({"async_processing": True, "job_id": job_id}),
        )

        log.info("Async processing invoked", job_id=job_id)
        return {
            "statusCode": 202,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {
                    "jobId": job_id,
                    "status": "processing",
                    "message": "Upload accepted, processing started",
                }
            ),
        }
    except Exception as e:
        log.error("Failed to start async processing", error=str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"returnMessage": f"Failed to start processing: {str(e)}"}),
        }


def handle_async_processing(event, context):
    """Async invocation entry point — drains a queued upload payload."""
    job_id = event.get("job_id")
    log.info("Starting async processing", job_id=job_id)

    bucket_name = os.getenv("S3_BUCKET")
    pending_key = f"upload-pending/{job_id}.json"

    try:
        s3_client = lf.S3
        response = s3_client.get_object(Bucket=bucket_name, Key=pending_key)
        body = json.loads(response["Body"].read().decode("utf-8"))
        result = process_upload_files(body, job_id, bucket_name)

        try:
            s3_client.delete_object(Bucket=bucket_name, Key=pending_key)
        except Exception as e:
            log.warning("Failed to delete pending file", key=pending_key, error=str(e))

        return result
    except Exception as e:
        log.error(
            "Failed to process job",
            job_id=job_id,
            error=str(e),
            traceback=traceback.format_exc(),
        )
        try:
            s3_client = lf.S3
            error_status = {
                "jobId": job_id,
                "status": "error",
                "timestamp": int(time.time()),
                "error": str(e),
            }
            s3_client.put_object(
                Bucket=bucket_name,
                Key=f"upload-status/{job_id}.json",
                Body=json.dumps(error_status),
                ContentType="application/json",
            )
        except Exception as status_err:
            log.warning("Failed to write error status to S3", job_id=job_id, error=str(status_err))
        return {"error": str(e)}


def _extract_recipes_from_files(files, file_errors):
    """Run OCR + per-file extraction. Returns ``[(recipe, file_idx), ...]``."""
    import handlepdf  # local import to keep cold-start cheap on GET path
    import ocr
    import upload as upload_mod

    all_recipes: List[Tuple[Dict, int]] = []
    for file_idx, file_data in enumerate(files):
        try:
            file_content = file_data.get("data", "")
            file_type = file_data.get("type", "").lower()

            if file_content.startswith("data:"):
                file_content = file_content.split(",", 1)[1] if "," in file_content else file_content

            is_pdf = "pdf" in file_type or file_type == "application/pdf"

            try:
                if is_pdf:
                    app_time = upload_mod.upload_user_data(
                        "user_pdfs", "application/pdf", "pdf", file_content
                    )
                else:
                    app_time = upload_mod.upload_user_data(
                        "user_images", "image/jpeg", "jpg", file_content
                    )
            except Exception as e:
                log.warning("Failed to upload user data, using fallback timestamp", error=str(e))
                app_time = int(time.time())

            if is_pdf:
                base64_images = handlepdf.pdf_to_base64_images(file_content)
                if base64_images is False:
                    file_errors.append(
                        {
                            "file": file_idx,
                            "title": "unknown",
                            "stage": "pdf_extract",
                            "reason": f"PDF too large or processing failed (max {PDF_MAX_PAGES} pages)",
                        }
                    )
                    continue
            else:
                base64_images = [file_content]

            for img_idx, base64_image in enumerate(base64_images):
                recipe_json = ocr.extract_recipe_data(base64_image)
                upload_mod.upload_user_data(
                    "user_images_json", "application/json", "json", recipe_json, app_time
                )
                if recipe_json is None:
                    file_errors.append(
                        {
                            "file": file_idx,
                            "title": "unknown",
                            "stage": "ocr",
                            "reason": "OCR returned no result",
                        }
                    )
                    continue

                try:
                    parsed_data = json.loads(recipe_json)
                    if isinstance(parsed_data, list):
                        for recipe in parsed_data:
                            all_recipes.append((recipe, file_idx))
                    else:
                        all_recipes.append((parsed_data, file_idx))
                except json.JSONDecodeError as e:
                    log.warning("Failed to parse OCR result as JSON", file_index=file_idx, error=str(e))
                    file_errors.append(
                        {
                            "file": file_idx,
                            "title": "unknown",
                            "stage": "ocr_json",
                            "reason": f"OCR JSON parse failed: {str(e)}",
                        }
                    )
        except Exception as e:
            log.error(
                "File extraction failed",
                file_idx=file_idx,
                error=str(e),
                traceback=traceback.format_exc(),
            )
            file_errors.append(
                {
                    "file": file_idx,
                    "title": "unknown",
                    "stage": "extract",
                    "reason": f"Extraction failed: {str(e)}",
                }
            )
    return all_recipes


def process_upload_files(body, job_id, bucket_name):
    """Run OCR + dedupe + persistence pipeline for an async upload payload."""
    import ocr
    import search_image as si
    from upload import batch_to_s3_atomic

    start_time = time.time()
    files = body["files"]
    log.info("Starting processing", job_id=job_id, file_count=len(files))

    try:
        embedding_store = lf.EmbeddingStore(bucket_name)
        existing_embeddings, _ = embedding_store.load_embeddings()
        embedding_generator = lf.EmbeddingGenerator()
        from duplicate_detector import DuplicateDetector
        duplicate_detector = DuplicateDetector(existing_embeddings)
    except Exception as e:
        log.error("Service initialization failed", error=str(e))
        raise

    file_errors: List[dict] = []
    all_recipes = _extract_recipes_from_files(files, file_errors)

    # ParseJSON / merge stage — surface failures into file_errors instead of swallowing.
    try:
        if all_recipes:
            recipes_only = [r[0] for r in all_recipes]
            log.info("Parsing and combining recipe objects", count=len(recipes_only))
            parsed_json = ocr.parseJSON(recipes_only)
            log.info("ParseJSON returned", characters=len(parsed_json))
            parsed_recipes = json.loads(parsed_json)
            if not isinstance(parsed_recipes, list):
                parsed_recipes = [parsed_recipes]

            log.info("Parsed recipes", count=len(parsed_recipes))
            parsed_recipes = merge_incomplete_recipes(parsed_recipes)
            log.info("After merge", count=len(parsed_recipes))

            final_recipes: List[Tuple[Dict, int]] = []
            for i, recipe in enumerate(parsed_recipes):
                if i < len(all_recipes):
                    file_idx = all_recipes[i][1]
                    final_recipes.append((recipe, file_idx))
            all_recipes = final_recipes
    except Exception as e:
        log.error("ParseJSON/merge failed", error=str(e), traceback=traceback.format_exc())
        # Surface affected files into file_errors so the user sees the failure.
        affected_files = sorted({fi for _, fi in all_recipes}) if all_recipes else []
        for fi in affected_files:
            file_errors.append(
                {
                    "file": fi,
                    "title": "unknown",
                    "stage": "parse_json",
                    "reason": f"ParseJSON failed: {str(e)}",
                }
            )
        all_recipes = []

    # Parallel processing with per-recipe wall-clock budget.
    unique_recipes: List[Dict] = []
    search_results_list: List[List[str]] = []
    new_embeddings: Dict[int, List[float]] = {}
    position_to_file_idx: Dict[int, int] = {}

    log.info("Starting parallel processing", recipe_count=len(all_recipes))

    try:
        with ThreadPoolExecutor(max_workers=3) as executor:
            future_to_idx = {}
            for recipe, file_idx in all_recipes:
                future = executor.submit(
                    process_single_recipe,
                    recipe,
                    embedding_generator,
                    duplicate_detector,
                )
                future_to_idx[future] = (recipe, file_idx, time.time())

            for idx, future in enumerate(as_completed(future_to_idx)):
                recipe, file_idx, submitted_at = future_to_idx[future]
                elapsed = time.time() - submitted_at
                if elapsed > RECIPE_BUDGET_SECONDS:
                    log.error(
                        "Recipe exceeded wall-clock budget",
                        title=recipe.get("Title", "unknown"),
                        elapsed=round(elapsed, 2),
                    )
                    file_errors.append(
                        {
                            "file": file_idx,
                            "title": recipe.get("Title", "unknown"),
                            "stage": "timeout",
                            "reason": f"Exceeded {RECIPE_BUDGET_SECONDS}s wall-clock budget",
                        }
                    )
                    continue

                try:
                    result_recipe, embedding, search_results, error_reason = future.result()
                except Exception as e:
                    file_errors.append(
                        {
                            "file": file_idx,
                            "title": recipe.get("Title", "unknown"),
                            "stage": "process",
                            "reason": f"Worker raised: {str(e)}",
                        }
                    )
                    continue

                if error_reason:
                    log.error(
                        "Recipe processing failed",
                        title=recipe.get("Title", "unknown"),
                        reason=error_reason,
                    )
                    file_errors.append(
                        {
                            "file": file_idx,
                            "title": recipe.get("Title", "unknown"),
                            "stage": "process",
                            "reason": error_reason,
                        }
                    )
                else:
                    position = len(unique_recipes)
                    unique_recipes.append(result_recipe)
                    search_results_list.append(search_results)
                    new_embeddings[position] = embedding
                    position_to_file_idx[position] = file_idx

        log.info(
            "Parallel processing complete",
            successful=len(unique_recipes),
            failed=len(file_errors),
        )
    except Exception as e:
        log.error("Parallel processing failed", error=str(e), traceback=traceback.format_exc())
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"returnMessage": f"Parallel processing failed: {str(e)}"}),
        }

    success_keys: List[str] = []
    json_data: Dict = {}

    log.info("Starting S3 upload", recipe_count=len(unique_recipes))

    try:
        if unique_recipes:
            s3_client = lf.S3
            # Only treat NoSuchKey as "empty bucket"; for any other error
            # retry with exponential backoff and fail loud if retries are
            # exhausted. Silently falling back to an empty dict would let
            # a transient S3 read failure overwrite existing recipes.
            json_data = None
            load_attempts = 3
            for attempt in range(load_attempts):
                try:
                    response = s3_client.get_object(
                        Bucket=bucket_name, Key="jsondata/combined_data.json"
                    )
                    json_data = json.loads(response["Body"].read())
                    log.info("Loaded existing recipes from S3", count=len(json_data))
                    break
                except s3_client.exceptions.NoSuchKey:
                    log.info("No existing recipe data found (first upload)")
                    json_data = {}
                    break
                except Exception as e:
                    log.error(
                        "Error loading existing data",
                        error=str(e),
                        attempt=attempt + 1,
                    )
                    if attempt + 1 == load_attempts:
                        return {
                            "statusCode": 500,
                            "headers": {"Content-Type": "application/json"},
                            "body": json.dumps(
                                {
                                    "success": False,
                                    "error": (
                                        "Failed to load existing recipe data from S3 "
                                        f"after {load_attempts} attempts: {str(e)}"
                                    ),
                                }
                            ),
                        }
                    time.sleep(0.3 * (2**attempt))

            used_urls = si.extract_used_image_urls(json_data)
            log.info("Found used image URLs", count=len(used_urls))

            unique_search_results: List[List[str]] = []
            for search_results in search_results_list:
                unused_urls = [url for url in search_results if url not in used_urls]
                if unused_urls:
                    unique_search_results.append(unused_urls)
                    used_urls.add(unused_urls[0])
                else:
                    unique_search_results.append(search_results[:5])

            json_data, success_keys, position_to_key, upload_errors = batch_to_s3_atomic(
                unique_recipes, unique_search_results
            )
            log.info("Batch upload complete", successful=len(success_keys))
            file_errors.extend(upload_errors)

            # Map embedding positions -> recipe keys with explicit miss accounting.
            keyed_embeddings: Dict[str, List[float]] = {}
            for position, embedding in new_embeddings.items():
                recipe_key = position_to_key.get(position)
                if recipe_key is None:
                    file_idx = position_to_file_idx.get(position, -1)
                    log.error(
                        "Position->key mapping missing",
                        position=position,
                        file_idx=file_idx,
                    )
                    file_errors.append(
                        {
                            "file": file_idx,
                            "title": (
                                unique_recipes[position].get("Title", "unknown")
                                if position < len(unique_recipes)
                                else "unknown"
                            ),
                            "stage": "mapping",
                            "reason": f"position->key mapping missing for position {position}",
                        }
                    )
                    continue
                keyed_embeddings[recipe_key] = embedding

            if keyed_embeddings:
                log.info("Saving embeddings", count=len(keyed_embeddings))
                embedding_store.add_embeddings(keyed_embeddings)
                log.info("Embeddings saved successfully")
        else:
            log.info("No unique recipes to upload")
    except Exception as e:
        log.error("Batch upload failed", error=str(e), traceback=traceback.format_exc())
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"returnMessage": f"Batch upload failed: {str(e)}"}),
        }

    success_count = len(success_keys)
    fail_count = len(file_errors)

    if success_count > 0 and fail_count == 0:
        message = f"{success_count} recipes added successfully"
    elif success_count > 0 and fail_count > 0:
        message = f"{success_count} recipes added, {fail_count} failed"
    elif success_count == 0 and fail_count > 0:
        message = f"All {fail_count} recipes failed"
    else:
        message = "No recipes processed"

    try:
        cloudwatch = lf.CLOUDWATCH
        execution_time = time.time() - start_time
        duplicate_count = sum(1 for err in file_errors if "Duplicate" in err.get("reason", ""))
        cloudwatch.put_metric_data(
            Namespace="RecipeProcessor",
            MetricData=[
                {"MetricName": "SuccessCount", "Value": success_count, "Unit": "Count"},
                {"MetricName": "FailureCount", "Value": fail_count, "Unit": "Count"},
                {"MetricName": "ExecutionTime", "Value": execution_time, "Unit": "Seconds"},
                {"MetricName": "DuplicateCount", "Value": duplicate_count, "Unit": "Count"},
            ],
        )
    except Exception as e:
        log.warning("Failed to publish CloudWatch metrics", error=str(e))

    try:
        s3_client = lf.S3
        completion_data = {
            "jobId": job_id,
            "status": "completed",
            "timestamp": int(time.time()),
            "successCount": success_count,
            "failCount": fail_count,
            "newRecipeKeys": success_keys,
            "errors": file_errors,
            "jsonData": json_data,
        }
        s3_client.put_object(
            Bucket=bucket_name,
            Key=f"upload-status/{job_id}.json",
            Body=json.dumps(completion_data),
            ContentType="application/json",
        )
    except Exception as e:
        log.warning("Failed to write completion flag to S3", job_id=job_id, error=str(e))

    log.info("Request complete", successful=success_count, failed=fail_count)
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(
            {
                "returnMessage": message,
                "successCount": success_count,
                "failCount": fail_count,
                "jsonData": json_data,
                "newRecipeKeys": success_keys,
                "errors": file_errors,
                "jobId": job_id,
            }
        ),
    }
