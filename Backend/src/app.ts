import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import searchRoutes from './presentation/routes/search.routes';
import { FRONTEND_URL } from './config';

const app = express();
app.use(express.json());
app.use(bodyParser.json());
app.use(cors({ origin: FRONTEND_URL }));
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.log(`➡️ Incoming Request: ${req.method} ${req.url}`);
    next();
});
app.use('/api', searchRoutes);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('❗️Unhandled error:', err);
    res.status(err.statusCode || 500).json({
        message: err.message || 'Internal Server Error',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

export default app;