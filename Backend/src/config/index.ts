import 'dotenv/config';

export const OPEN_AI_API_KEY = process.env.OPEN_AI_API_KEY || '';
export const QDRANT_HOST = process.env.QDRANT_HOST || "localhost";
export const QDRANT_PORT = parseInt(process.env.QDRANT_PORT || "6333", 10);
export const TEXT_COLLECTION = process.env.TEXT_COLLECTION || "texts_collection_mxbai";
export const IMAGE_COLLECTION = process.env.IMAGE_COLLECTION || "images_collection_mxbai";
export const APP_PORT = parseInt(process.env.APP_PORT || "3000", 10);
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export const CRAWLER_START_URL = process.env.CRAWLER_START_URL || 'https://www.deeplearning.ai/';
export const CRAWLER_SAVE_PATTERN = process.env.CRAWLER_SAVE_PATTERN || 'https://www.deeplearning.ai/the-batch/';
export const CRAWLER_IGNORE_PATTERN = process.env.CRAWLER_IGNORE_PATTERN || '/the-batch/tag/';
export const CRAWLER_MAX_RETRIES = parseInt(process.env.CRAWLER_MAX_RETRIES || "3", 10);
export const CRAWLER_PAGES_OUTPUT_FILENAME = process.env.CRAWLER_PAGES_OUTPUT_FILENAME || 'deeplearning_ai_batch_pages.json';
export const CRAWLER_IMAGES_OUTPUT_FILENAME = process.env.CRAWLER_IMAGES_OUTPUT_FILENAME || 'deeplearning_ai_batch_images.json';
export const PREPROCESSOR_CHUNKS_OUTPUT_FILENAME = process.env.PREPROCESSOR_CHUNKS_OUTPUT_FILENAME || 'deeplearning_ai_article_chunks.json';
export const PREPROCESSOR_PROCESSED_IMAGES_FILE = process.env.PREPROCESSOR_PROCESSED_IMAGES_FILE || 'deeplearning_ai_processed_images.json';


if (!OPEN_AI_API_KEY) {
    console.warn("WARNING: OPEN_AI_API_KEY (or LLM_API_KEY) is not set. LLM functionality may be impaired.");
}
if (!QDRANT_HOST || isNaN(QDRANT_PORT)) {
    console.warn("WARNING: QDRANT_HOST or QDRANT_PORT is not set or invalid. Qdrant connection may fail.");
}