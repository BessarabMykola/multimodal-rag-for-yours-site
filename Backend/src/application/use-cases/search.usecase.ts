import { Document } from "@langchain/core/documents";
import { IArticleResponse, IImage, ILink } from "../../domain/entities/article.entity";
import { IRAGChainResult } from "../../domain/interfaces/rag.interface";

import * as fs from 'fs';

export class SearchUseCase {
    private ragChain: any;

    constructor(ragChainInstance: any) {
        this.ragChain = ragChainInstance;
    }

    async execute(query: string): Promise<IArticleResponse> {

        if (!query) {
            throw new Error('Query cannot be empty.');
        }

        const data = JSON.parse(fs.readFileSync('../Data/deeplearning_ai_batch_images.json', 'utf8'));
        const getImageSrcById = (originalId: string) => {
            if (!data.images || !Array.isArray(data.images)) return null;
            const image = data.images.find((img: IImage) => img.id === originalId);
            return image ? image.src : null;
        };

        const ragResult: IRAGChainResult = await this.ragChain.invoke(query);

        const allRawImagesFromRag = [...ragResult.retrievedImages, ...ragResult.generatedImages];

        const uniqueImagesMap = new Map<string, IImage>();
        allRawImagesFromRag.forEach((img: Document) => {
            const originalId = img.metadata.originalId;
            if (!originalId) {
                return;
            }

            const src = getImageSrcById(originalId);
            if (!uniqueImagesMap.has(originalId)) {
                uniqueImagesMap.set(originalId, {
                    id: originalId,
                    src: src,
                    alt: img.pageContent,
                });
            } else {
                console.log(`[IMAGE PROCESSING] Skipped duplicate image with ID: "${originalId}"`);
            }
        });

        const combinedUniqueImages: IImage[] = Array.from(uniqueImagesMap.values());
         const linksToArticles: ILink[] = ragResult.retrievedTexts.map((doc: Document) => {
            const linkUrl = doc.metadata.url;
            const linkTitle = doc.metadata.title || linkUrl || 'Детальніше';
            const imagesInLink: string[] = doc.metadata.images_ids || [];
            return {
                url: linkUrl,
                title: linkTitle,
                images: imagesInLink,
            };
        });

        const finalResponseArticle: IArticleResponse = {
            id: 'overall-rag-response-' + Math.random().toString(36).substring(2, 11),
            title: ragResult.originalQuestion || query,
            content: ragResult.answer,
            links: linksToArticles,
            images: combinedUniqueImages,
            date: new Date().toISOString(),
        };

        return finalResponseArticle;
    }
}