import { Document } from "@langchain/core/documents";

export interface IRAGRetrieverResult {
    texts: Document[];
    images: Document[];
}

export interface IRAGChainResult {
    answer: string;
    retrievedTexts: Document[];
    retrievedImages: Document[];
    generatedImages: Document[];
    originalQuestion: string;
    formattedContextForDebug?: string;
}
