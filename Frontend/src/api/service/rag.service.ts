import type { IArticleResponse } from "../response/article.response.ts";

const API_BASE_URL = "http://localhost:3000/api";

export const searchArticles = async (query: string): Promise<IArticleResponse> => {
    try {
        const response = await fetch(`${API_BASE_URL}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: query }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error in time screaching query.');
        }

        const data: IArticleResponse = await response.json();
        return data;
    } catch (error) {
        console.error('Error in time try tacke response:', error);
        throw error;
    }
};