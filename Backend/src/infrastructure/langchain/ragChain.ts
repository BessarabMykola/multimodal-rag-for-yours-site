import { embeddings, llm } from './langchainModels';
import { IRAGChainResult, IRAGRetrieverResult } from "../../domain/interfaces/rag.interface";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda, RunnableParallel, RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Document } from "@langchain/core/documents";
import qdrantClient from '../qdrant/qdrantClient';
import { TEXT_COLLECTION, IMAGE_COLLECTION } from '../../config';
import { QdrantClient } from "@qdrant/js-client-rest";
import { Embeddings } from "@langchain/core/embeddings";

function createCustomQdrantRetriever(
    client: QdrantClient,
    embeddings: Embeddings,
    collectionName: string,
    limit: number,
    isImageCollection: boolean = false
) {
    return async (query: string): Promise<Document[]> => {
        try {
            const queryVector = await embeddings.embedQuery(query);

            const searchResult = await client.search(collectionName, {
                vector: queryVector,
                limit: limit,
                with_payload: true,
            });

            const documents = searchResult.map((point) => {
                const payload = point.payload || {};
                let pageContent = "";
                let metadata: Record<string, any> = {};

                if (isImageCollection) {
                    pageContent = (payload.alt as string) || "";
                    metadata = {
                        originalId: payload.originalId,
                    };
                } else {
                    pageContent = (payload.content as string) || "";
                    metadata = {
                        url: payload.url,
                        title: payload.title,
                        images_ids: payload.images_ids,
                        tags: payload.tags,
                    };
                }

                metadata.score = point.score;
                return new Document({ pageContent, metadata });
            });

            return documents;

        } catch (error) {
            console.error(`Error in createCustomQdrantRetriever for collection ${collectionName}:`, error);
            return [];
        }
    };
}

const textRetrieverFn = createCustomQdrantRetriever(qdrantClient, embeddings, TEXT_COLLECTION, 3, false);
const imageRetrieverFn = createCustomQdrantRetriever(qdrantClient, embeddings, IMAGE_COLLECTION, 2, true);

const textRetriever = new RunnableLambda({ func: textRetrieverFn });
const imageRetriever = new RunnableLambda({ func: imageRetrieverFn });

const formatDocs = (docs: IRAGRetrieverResult): string => {
    let textContext = "Found text fragments:\n";
    docs.texts.forEach(doc => {
        textContext += `Title: ${doc.metadata.title || 'No Title'}\nContent: ${doc.pageContent}\nURL: ${doc.metadata.url || 'No URL'}\n\n`;
    });
    let imageContext = "Found relevant images (by their description):\n";
    if (docs.images.length > 0) {
        docs.images.forEach(doc => {
            // Убедимся, что URL изображения присутствует, если это возможно
            const imageUrl = doc.metadata.src || doc.metadata.url || 'No URL'; // Предполагаем, что src или url может быть в метаданных для изображений
            imageContext += `Description (alt-text): "${doc.pageContent}" (URL: ${imageUrl})\n`;
        });
    } else {
        imageContext += "No relevant images found.\n";
    }

    const fullContext = `${textContext}\n${imageContext}`;
    return fullContext;
};

const queryTransformPrompt = ChatPromptTemplate.fromTemplate(`
 You are an expert at rephrasing queries. Your task is to convert a user's conversational question into a concise, keyword-rich query optimized for a vector database search.

Instructions:
- Focus on the core concepts, entities, and the main intent of the question.
- Remove all conversational filler, such as "Can you tell me about...", "I was wondering if...", "please", "thank you", etc.
- The output must be a declarative statement or a list of key concepts, not a question.
- Do not add any new information that was not present in the original question.
- Return only the generated query, with no prefixes, labels, or explanations.

Original Question:
{question}

Optimized Query:
`);

const queryTransformChain = RunnableSequence.from([
    {
        question: new RunnablePassthrough()
    },
    queryTransformPrompt,
    llm,
    new StringOutputParser()
]);

const generateImageDescription = async (articleContent: string): Promise<string | null> => {
    const imageDescriptionPromptTemplate = ChatPromptTemplate.fromTemplate(`
        Generate a concise, descriptive alt-text or caption for an image based on the following article content.
        Focus on key visual elements that might appear in an image related to this text.
        The description should be suitable for searching for an image.
        Do not include any introductory or concluding phrases, just the description.

        ARTICLE CONTENT:
        ---
        {articleContent}
        ---

        IMAGE DESCRIPTION:
    `);
    try {
        const chain = imageDescriptionPromptTemplate.pipe(llm).pipe(new StringOutputParser());
        const result = await chain.invoke({ articleContent });
        return result.trim();
    } catch (error) {
        console.error("Error generating image description:", error);
        return null;
    }
};

const retrieverChain = RunnableParallel.from({
    texts: textRetriever,
    images: imageRetriever,
});

const answerPromptTemplate = ChatPromptTemplate.fromTemplate(`
    Answer the user's question based on the provided context.
    Strive to find the answer within the text, even if it's not explicitly stated. Your task is to infer and synthesize information from the context to construct a helpful response.
    Base your entire answer strictly on the provided context. Do not use any external knowledge.

    If, after careful analysis, you determine that the context contains no information that can be used to even partially or inferentially answer the question, then and only then should you state that you cannot provide an answer based on the given information.

    CONTEXT:
    ---
    {context}
    ---

    QUESTION: {question}

    ANSWER:
`);

const coreAnswerChain = RunnableSequence.from([
    {
        context: new RunnableLambda({
            func: async (input: { context: IRAGRetrieverResult; question: string }) => {
                // --- Добавляем логирование полученного контекста ЗДЕСЬ ---
                console.log("\n--- Retrieved Context from Qdrant ---");
                console.log("Text Documents:", input.context.texts.map(doc => ({
                    title: doc.metadata.title,
                    url: doc.metadata.url,
                    score: doc.metadata.score,
                    pageContent: doc.pageContent.substring(0, 150) + "...", // Обрезаем для краткости
                })));
                console.log("Image Documents:", input.context.images.map(doc => ({
                    alt: doc.pageContent,
                    originalId: doc.metadata.originalId,
                    score: doc.metadata.score,
                    src: doc.metadata.src || 'N/A' // Показываем src, если есть
                })));
                console.log("--- End Retrieved Context ---\n");
                // --- Конец логирования ---

                const formattedContext = formatDocs(input.context);
                return formattedContext;
            }
        }),
        question: new RunnableLambda({
            func: (input: { context: IRAGRetrieverResult; question: string }) => {
                return input.question;
            }
        }),
    },
    answerPromptTemplate,
    llm,
    new StringOutputParser(),
]);

const generateAndFetchImages = new RunnableLambda({
    func: async (input: { retrievedTexts: Document[] }) => {
        const generatedDescriptions: string[] = [];
        for (const doc of input.retrievedTexts) {
            const description = await generateImageDescription(doc.pageContent);
            if (description) {
                generatedDescriptions.push(description);
            }
        }

        const secondaryImageSearchResults: Document[] = [];
        const imageSearchRetrieverFn = createCustomQdrantRetriever(qdrantClient, embeddings, IMAGE_COLLECTION, 1, true);

        for (const desc of generatedDescriptions) {
            const searchResults = await imageSearchRetrieverFn(desc);
            if (searchResults && searchResults.length > 0) {
                secondaryImageSearchResults.push(...searchResults);
            } else {
                console.log(`[Generated Images] No secondary images found for description: "${desc.substring(0, 50)}..."`);
            }
        }
        return secondaryImageSearchResults;
    }
});


export const ragChain = RunnableSequence.from([
    {
        question: new RunnablePassthrough(),
        context: queryTransformChain.pipe(retrieverChain)
    },
    RunnableParallel.from({
        answer: coreAnswerChain,
        retrievedTexts: (input: { question: string, context: IRAGRetrieverResult }) => {
            return input.context.texts;
        },
        retrievedImages: (input: { question: string, context: IRAGRetrieverResult }) => {
            return input.context.images;
        },
        originalQuestion: (input: { question: string, context: IRAGRetrieverResult }) => input.question,
    })
]).pipe(
    RunnablePassthrough.assign({
        generatedImages: async (input: Omit<IRAGChainResult, 'generatedImages'>) => {
            const result = await generateAndFetchImages.invoke({ retrievedTexts: input.retrievedTexts });
            return result;
        },
    })
);


export async function getRAGChain() {
    return ragChain;
}