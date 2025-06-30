import type {IImage, ILink} from "../interface/rag.interface.ts";

export interface IArticleResponse {
    id: string;
    title: string;
    content: string;
    links: ILink[];
    images: IImage[];
    date: Date;
}