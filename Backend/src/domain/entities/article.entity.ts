export interface ILink {
    url: string;
    title: string;
    images?: string[];
}

export interface IImage {
    id: string;
    src: string;
    alt: string;
    source?: 'original_context' | 'generated_description_search';
}

export interface IArticleResponse {
    id: string;
    title: string;
    content: string;
    links: ILink[];
    images: IImage[];
    date: string;
}

export interface IChunk {
    id: number;
    url: string;
    title: string;
    chunkTitle: string;
    content: string;
    images: string[];
    tags: string[];
}

export interface IProcessedImage {
    id: number;
    originalId: string;
    alt: string;
    src?: string;
}