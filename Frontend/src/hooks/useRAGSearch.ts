import { useState, useCallback } from 'react';
import {Status, type StatusType} from '../api/enam/status.enum';
import {searchArticles} from "../api/service/rag.service.ts";
import type {IArticleResponse} from "../api/response/article.response.ts";

interface UseRAGSearchResult {
    articles: IArticleResponse | undefined;
    status: StatusType;
    error: string | null;
    search: (query: string) => void;
}

export const useRAGSearch = (): UseRAGSearchResult => {
    const [articles, setArticles] = useState<IArticleResponse | undefined>(undefined);
    const [status, setStatus] = useState<StatusType>(Status.IDLE);
    const [error, setError] = useState<string | null>(null);

    const search = useCallback(async (query: string) => {
        setStatus(Status.LOADING);
        setError(null);
        setArticles(undefined);
        try {
            const response = await searchArticles(query);
            setArticles(response);
            setStatus(Status.SUCCESS);
        } catch (err) {
            setError('Empty request, try again please');
            setStatus(Status.ERROR);
            console.error(err);
            setArticles(undefined);
        }
    }, []);

    return { articles, status, error, search };
};