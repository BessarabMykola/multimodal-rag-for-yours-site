import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { OPEN_AI_API_KEY} from '../../config';

export const embeddings = new OpenAIEmbeddings({
    apiKey: OPEN_AI_API_KEY,
    modelName: "text-embedding-3-small"
});


export const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    apiKey: OPEN_AI_API_KEY
});
