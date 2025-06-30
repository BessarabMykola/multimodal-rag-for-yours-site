import { Request, Response, NextFunction } from 'express';
import { SearchUseCase } from '../../application/use-cases/search.usecase';
import { getRAGChain } from '../../infrastructure/langchain/ragChain';

let searchUseCaseInstance: SearchUseCase;


export const initializeSearchController = async () => {
    const ragChain = await getRAGChain();
    searchUseCaseInstance = new SearchUseCase(ragChain);
    console.log("SearchController initialized with RAG Chain.");
};

export class SearchController {
    static async search(req: Request, res: Response, next: NextFunction) {
        const query = req.body.query as string;

        if (!query) {
            return res.status(400).json({ message: 'Query parameter is required.' });
        }

        try {
            if (!searchUseCaseInstance) {
                await initializeSearchController();
            }

            const result = await searchUseCaseInstance.execute(query);
            res.json(result);
        } catch (error: any) {
            console.error('Error in SearchController:', error);
            next({ statusCode: 500, message: error.message || 'Error processing search request.' });
        }
    }
}

initializeSearchController().catch(err => {
    console.error("Failed to initialize SearchController:", err);
    process.exit(1);
});