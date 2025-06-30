import app from './app';
import { APP_PORT } from './config';
import { runEvaluation } from './utils/run_evaluation';

const startServer = async () => {
    try {
        app.listen(APP_PORT, () => {
            console.log(`Server is running on port ${APP_PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};

startServer();