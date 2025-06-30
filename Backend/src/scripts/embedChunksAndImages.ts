import * as fs from 'fs/promises';
import * as path from 'path';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import qdrantClient from '../infrastructure/qdrant/qdrantClient';
import {
    PREPROCESSOR_CHUNKS_OUTPUT_FILENAME,
    PREPROCESSOR_PROCESSED_IMAGES_FILE,
    TEXT_COLLECTION,
    IMAGE_COLLECTION
} from '../config';
import { IChunk, IProcessedImage} from "../domain/entities/article.entity";

const DATA_BASE_DIR = path.resolve(__dirname, '..', '..', '..', 'Data');

const OPEN_AI_API_KEY="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"

export const embeddings = new OpenAIEmbeddings({
    apiKey: OPEN_AI_API_KEY,
    modelName: "text-embedding-3-small"
});

async function loadJsonFile<T>(filename: string): Promise<T | null> {
    const filePath = path.join(DATA_BASE_DIR, filename);
    try {
        const rawData = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(rawData);
    } catch (error: any) {
        if (error.code !== 'ENOENT') {
            console.error(`[!!!] Error reading or parsing file ${filePath}: ${error.message}`);
        }
        return null;
    }
}

async function embedAndUpsertChunks(chunks: IChunk[], qdrant: QdrantClient): Promise<void> {
    console.log(`[i] Starting embedding and upserting of ${chunks.length} text chunks...`);
    const batchSize = 100;

    for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const textsToEmbed = batch.map(chunk => `${chunk.title} ${chunk.chunkTitle} ${chunk.content}`);

        try {
            const vectors = await embeddings.embedDocuments(textsToEmbed);

            const points = batch.map((chunk, index) => ({
                id: chunk.id,
                vector: vectors[index],
                payload: {
                    url: chunk.url,
                    title: chunk.title,
                    chunkTitle: chunk.chunkTitle,
                    content: chunk.content,
                    images_ids: chunk.images,
                    tags: chunk.tags,
                },
            }));

            await qdrant.upsert(TEXT_COLLECTION, { wait: true, batch: { ids: points.map(p => p.id), vectors: points.map(p => p.vector), payloads: points.map(p => p.payload) } });
            console.log(`[✔] Upserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)} of text chunks.`);
        } catch (error) {
            console.error(`[!!!] Error embedding or upserting text chunk batch starting from index ${i}:`, error);
        }
    }
    console.log(`[✔] Finished embedding and upserting all text chunks to collection '${TEXT_COLLECTION}'.`);
}

async function embedAndUpsertImages(images: IProcessedImage[], qdrant: QdrantClient): Promise<void> {
    console.log(`[i] Starting embedding and upserting of ${images.length} image descriptions...`);
    const batchSize = 100;

    for (let i = 0; i < images.length; i += batchSize) {
        const batch = images.slice(i, i + batchSize);
        const altsToEmbed = batch.map(img => img.alt);

        try {
            const vectors = await embeddings.embedDocuments(altsToEmbed);

            const points = batch.map((img, index) => ({
                id: img.id,
                vector: vectors[index],
                payload: {
                    originalId: img.originalId,
                    alt: img.alt,
                    src: img.src,
                },
            }));

            await qdrant.upsert(IMAGE_COLLECTION, { wait: true, batch: { ids: points.map(p => p.id), vectors: points.map(p => p.vector), payloads: points.map(p => p.payload) } });
            console.log(`[✔] Upserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(images.length / batchSize)} of image descriptions.`);
        } catch (error) {
            console.error(`[!!!] Error embedding or upserting image description batch starting from index ${i}:`, error);
        }
    }
    console.log(`[✔] Finished embedding and upserting all image descriptions to collection '${IMAGE_COLLECTION}'.`);
}

async function ensureCollectionsExist(qdrant: QdrantClient) {
    console.log('[i] Ensuring Qdrant collections exist...');
    const vectorSize = (await embeddings.embedQuery("test")).length; // Получаем размер вектора от модели эмбеддингов

    const textCollectionExists = (await qdrant.getCollections()).collections.some(c => c.name === TEXT_COLLECTION);
    if (!textCollectionExists) {
        console.log(`[i] Creating text collection: '${TEXT_COLLECTION}' with vector size ${vectorSize}...`);
        await qdrant.createCollection(TEXT_COLLECTION, {
            vectors: { size: vectorSize, distance: 'Cosine' }, // Cosine - обычная метрика для эмбеддингов
        });
        console.log(`[✔] Text collection '${TEXT_COLLECTION}' created.`);
    } else {
        console.log(`[i] Text collection '${TEXT_COLLECTION}' already exists.`);
    }

    const imageCollectionExists = (await qdrant.getCollections()).collections.some(c => c.name === IMAGE_COLLECTION);
    if (!imageCollectionExists) {
        console.log(`[i] Creating image collection: '${IMAGE_COLLECTION}' with vector size ${vectorSize}...`);
        await qdrant.createCollection(IMAGE_COLLECTION, {
            vectors: { size: vectorSize, distance: 'Cosine' },
        });
        console.log(`[✔] Image collection '${IMAGE_COLLECTION}' created.`);
    } else {
        console.log(`[i] Image collection '${IMAGE_COLLECTION}' already exists.`);
    }
    console.log('[✔] All Qdrant collections checked.');
}


async function main() {
    console.log('[i] Starting embedding process...');
    const startTime = process.hrtime.bigint();
    await ensureCollectionsExist(qdrantClient);
    const chunksData = await loadJsonFile<{ chunks: IChunk[] }>(PREPROCESSOR_CHUNKS_OUTPUT_FILENAME);
    const allChunks = chunksData?.chunks || [];
    if (allChunks.length === 0) {
        console.warn('[!] No chunks found to embed. Please run preprocessing first.');
        return;
    }
    await embedAndUpsertChunks(allChunks, qdrantClient);

    const imagesData = await loadJsonFile<{ images: IProcessedImage[] }>(PREPROCESSOR_PROCESSED_IMAGES_FILE);
    const processedImages = imagesData?.images || [];
    if (processedImages.length === 0) {
        console.warn('[!] No processed images found to embed. Please run preprocessing first.');
        return;
    }
    await embedAndUpsertImages(processedImages, qdrantClient);

    const endTime = process.hrtime.bigint();
    const totalTimeMs = Number(endTime - startTime) / 1_000_000;
    const totalTimeSeconds = (totalTimeMs / 1000).toFixed(2);
    console.log(`[✔] Embedding process completed in ${totalTimeSeconds} seconds.`);
}

main().catch(err => console.error('[!!!] Critical error in embedChunksAndImages.ts:', err));