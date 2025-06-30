import { Router } from 'express';
import {SearchController} from "../controllers/search.controller";

const router = Router();

router.post('/search', async (req, res, next) => {
    await SearchController.search(req, res, next);
});

export default router;