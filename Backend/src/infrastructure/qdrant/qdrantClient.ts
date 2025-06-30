import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_HOST, QDRANT_PORT } from '../../config';

const qdrantClient = new QdrantClient({
    host: QDRANT_HOST,
    port: QDRANT_PORT,
});

export default qdrantClient;