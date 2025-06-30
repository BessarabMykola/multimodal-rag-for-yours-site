// src/scripts/crawlAndPreprocess.ts
import axios from 'axios';
import cheerio from 'cheerio';
import { URL } from 'url';
import fs from 'fs';
import pLimit from 'p-limit';
import {
    CRAWLER_START_URL,
    CRAWLER_SAVE_PATTERN,
    CRAWLER_IGNORE_PATTERN,
    CRAWLER_MAX_RETRIES,
    CRAWLER_PAGES_OUTPUT_FILENAME,
    CRAWLER_IMAGES_OUTPUT_FILENAME,
    PREPROCESSOR_CHUNKS_OUTPUT_FILENAME,
    PREPROCESSOR_PROCESSED_IMAGES_FILE
} from '../config';

interface IPageContentBodyElement {
    type: string;
    imageId?: string;
    text?: string;
    href?: string;
}

interface IPageContentHeader {
    title?: string;
    subtitle?: string;
    author?: string;
    tags?: string[];
    time?: string;
    headerImageId?: string;
}

interface IPageContent {
    header: IPageContentHeader;
    body: IPageContentBodyElement[];
}

interface IPageData {
    id: string;
    url: string;
    title: string;
    content: IPageContent;
    imageIds: string[];
}

interface IImageMeta {
    id: string;
    src: string;
    alt: string;
}

interface IChunk {
    id: number;
    url: string;
    title: string;
    chunkTitle: string;
    content: string;
    images: string[];
    tags: string[];
}

interface IProcessedImage {
    id: number;
    originalId: string;
    alt: string;
    src?: string;
}


const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.199 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:114.0) Gecko/20100101 Firefox/114.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.5672.127 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.5615.49 Safari/537.36',
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:113.0) Gecko/20100101 Firefox/113.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 SamsungBrowser/22.0 Chrome/96.0.4664.45 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.199 Safari/537.36 Edg/114.0.1823.67'
];

const globalRequestLimiter = pLimit(1);

let agentCounter = 0;

const visited = new Set<string>();
const pagesData: IPageData[] = [];
const imagesData: IImageMeta[] = [];
const uniqueImages = new Map<string, IImageMeta>();
let imageIdCounter = 1;

function shouldSavePage(url: string): boolean {
    return url.startsWith(CRAWLER_SAVE_PATTERN) && !url.includes(CRAWLER_IGNORE_PATTERN);
}

function shouldQueueUrl(url: string): boolean {
    return url === CRAWLER_START_URL || url.startsWith(CRAWLER_SAVE_PATTERN);
}

async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithAgent(url: string) {
    const idx = agentCounter++ % userAgents.length;
    return globalRequestLimiter(async () => {
        await delay(400); // Delay between requests
        const client = axios.create({
            headers: {
                'User-Agent': userAgents[idx],
                'DNT': '1',
                'Sec-GPC': '1'
            },
            timeout: 30000,
        });
        return client.get(url);
    });
}

function getCleanImageUrl(srcAttr: string | undefined, baseUrl: string): string | null {
    let src = srcAttr;
    if (!src) return null;

    const urlParamsIndex = src.indexOf('?');
    if (urlParamsIndex !== -1) {
        const urlParams = new URLSearchParams(src.substring(urlParamsIndex + 1));
        const imageUrlParam = urlParams.get('url');
        if (imageUrlParam) {
            src = decodeURIComponent(imageUrlParam);
        }
    }

    if (src.startsWith('data:') || src === '#') {
        return null;
    }

    try {
        return new URL(src, baseUrl).href;
    } catch {
        return null;
    }
}

function processImage(imageUrl: string | null, altText: string = ''): string | null {
    if (!imageUrl) return null;

    let imageObj = uniqueImages.get(imageUrl);
    if (!imageObj) {
        const id = `img_${imageIdCounter++}`;
        imageObj = { id, src: imageUrl, alt: altText.trim() };
        uniqueImages.set(imageUrl, imageObj);
        imagesData.push(imageObj);
    }
    return imageObj.id;
}

async function processUrl(url: string, queue: string[]) {
    if (visited.has(url)) return;
    visited.add(url);

    let html: string;
    for (let attempt = 1; attempt <= CRAWLER_MAX_RETRIES; attempt++) {
        try {
            const resp = await fetchWithAgent(url);
            html = resp.data;
            break;
        } catch (e: any) {
            console.warn(`[!] Ошибка ${attempt} при ${url}: ${e.message}`);
            if (attempt === CRAWLER_MAX_RETRIES) return;
        }
    }

    console.log(`[+] Парсим: ${url}`);
    const $ = cheerio.load(html!);

    const content: IPageContent = {
        header: {},
        body: []
    };
    const pageImageIds = new Set<string>();

    if (shouldSavePage(url)) {
        const articleHeaderElement = $('header.py-12.bg-slate-100.lg\\:py-16');
        const articleBody = $('.prose--styled.justify-self-center.post_postContent__wGZtc');

        if (articleHeaderElement.length) {
            content.header.title = articleHeaderElement.find('h1').text().trim() || $('title').text().trim();
            content.header.subtitle = articleHeaderElement.find('h1 span.block.mt-2.text-3xl.font-normal.text-slate-400.md\\:text-4xl.lg\\:text-4xl').text().trim();
            content.header.author = articleHeaderElement.find('.post_postByline__Zz3Yf a').text().trim();

            const tags: string[] = [];
            articleHeaderElement.find('.flex.flex-wrap.gap-2.mt-8 a div').each((_, el) => {
                const tagText = $(el).text().trim();
                if (tagText) {
                    tags.push(tagText);
                }
            });
            content.header.tags = tags;

            const publishedBlock = articleHeaderElement.find('div.ml-2.text-sm.undefined:contains("Published")');
            if (publishedBlock.length) {
                content.header.time = publishedBlock.next('.mt-1.text-slate-600.text-base.undefined').find('a div').text().trim();
            }

            const headerImgContainer = articleHeaderElement.find('.relative.flex.items-center.w-full.max-w-full.overflow-hidden.aspect-w-16.aspect-h-9');
            const headerImg = headerImgContainer.find('img').first();
            if (headerImg.length) {
                const src = headerImg.attr('data-src') || headerImg.attr('src');
                const cleanSrc = getCleanImageUrl(src, url);
                if (cleanSrc) {
                    const imageId = processImage(cleanSrc, headerImg.attr('alt'));
                    if (imageId) {
                        content.header.headerImageId = imageId;
                        pageImageIds.add(imageId);
                    }
                }
            }
        }

        if (articleBody.length) {
            articleBody.find('h1, h2, h3, h4, p, li, strong, em, a, img, hr').each((_, el) => {
                const $el = $(el);
                const tag = $el[0].tagName.toLowerCase();
                const elementData: IPageContentBodyElement = { type: tag };

                if (tag === 'img') {
                    const src = $el.attr('data-src') || $el.attr('src');
                    const cleanSrc = getCleanImageUrl(src, url);
                    if (cleanSrc) {
                        const imageId = processImage(cleanSrc, $el.attr('alt'));
                        if (imageId) {
                            elementData.imageId = imageId;
                            pageImageIds.add(imageId);
                        }
                    }
                } else if (tag === 'a') {
                    const imgInsideLink = $el.find('img').first();
                    let linkHref = $el.attr('href');
                    let cleanLinkHref = getCleanImageUrl(linkHref, url);

                    if (imgInsideLink.length) {
                        const imgSrc = imgInsideLink.attr('data-src') || imgInsideLink.attr('src');
                        const cleanImgSrc = getCleanImageUrl(imgSrc, url);
                        if (cleanImgSrc) {
                            const imageId = processImage(cleanImgSrc, imgInsideLink.attr('alt') || $el.text());
                            if (imageId) {
                                elementData.type = 'img_link';
                                elementData.imageId = imageId;
                                pageImageIds.add(imageId);
                            }
                        }
                    } else if (cleanLinkHref) {
                        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
                        const isDirectImageLink = imageExtensions.some(ext => cleanLinkHref!.toLowerCase().endsWith(ext));

                        if (isDirectImageLink) {
                            const imageId = processImage(cleanLinkHref, $el.text().trim());
                            if (imageId) {
                                elementData.type = 'img_link';
                                elementData.imageId = imageId;
                                pageImageIds.add(imageId);
                            }
                        } else {
                            elementData.text = $el.text().trim();
                            try {
                                const urlObj = new URL(linkHref!, url);
                                urlObj.search = '';
                                urlObj.hash = '';
                                elementData.href = urlObj.href;
                            } catch {}
                        }
                    } else {
                        elementData.text = $el.text().trim();
                        try {
                            const urlObj = new URL(linkHref!, url);
                            urlObj.search = '';
                            urlObj.hash = '';
                            elementData.href = urlObj.href;
                        } catch {}
                    }
                } else if (tag === 'hr') {
                } else {
                    elementData.text = $el.text().trim();
                }

                if (Object.keys(elementData).length > 1 || (tag === 'hr' && Object.keys(elementData).length === 1)) {
                    content.body.push(elementData);
                }
            });
        }
    }

    if (shouldSavePage(url)) {
        pagesData.push({
            id: url,
            url,
            title: $('title').text().trim(),
            content: content,
            imageIds: Array.from(pageImageIds),
        });
    }

    const baseDomain = new URL(CRAWLER_START_URL).hostname;
    $('a[href]').each((_, a) => {
        let href = $(a).attr('href');
        if (!href) return;
        try {
            const abs = new URL(href, url);
            if (abs.hostname === baseDomain && shouldQueueUrl(abs.href)) {
                abs.search = '';
                abs.hash = '';
                const clean = abs.href;
                if (!visited.has(clean)) queue.push(clean);
            }
        } catch {}
    });
}

const imageUsageMap = new Map<string, Set<number>>();

function loadJsonFile(filePath: string): any | null {
    try {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(rawData);
    } catch (error: any) {
        if (error.code !== 'ENOENT') {
            console.error(`[!!!] Ошибка при чтении или парсинге файла ${filePath}: ${error.message}`);
        }
        return null;
    }
}

function getCleanText(element: IPageContentBodyElement | { text: string }): string {
    if (!element || typeof element.text !== 'string') return '';
    const $ = cheerio.load(element.text);
    return $.text().replace(/&nbsp;|\u00A0/g, ' ').trim();
}

function slugify(text: string): string {
    if (typeof text !== 'string') return '';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
        .slice(0, 100);
}

function assembleChunkText(elements: IPageContentBodyElement[]): string {
    const uniqueLines = new Set<string>();
    const resultLines: string[] = [];

    for (const el of elements) {
        if (el.type === 'img' || el.type === 'hr' || el.type === 'img_link') continue;

        let elText = getCleanText(el);
        if (elText.toLowerCase() === 'news') continue;
        if (!elText) continue;

        let formattedText = '';
        switch (el.type) {
            case 'h1':
            case 'h2':
            case 'h3':
            case 'h4':
                formattedText = elText + '\n';
                break;
            case 'p':
                formattedText = elText;
                break;
            case 'li':
                if (elText.length > 50 || elText.split(' ').length > 5) {
                    formattedText = `• ${elText}`;
                } else continue;
                break;
            case 'strong':
            case 'em':
            case 'a':
                formattedText = elText;
                break;
            default:
                continue;
        }

        if (!uniqueLines.has(formattedText)) {
            uniqueLines.add(formattedText);
            resultLines.push(formattedText);
        }
    }
    return resultLines.join('\n\n').trim();
}

function collectImageOriginalIdsInChunk(elements: IPageContentBodyElement[]): string[] {
    const collectedImageIds = new Set<string>();
    elements.forEach(el => {
        if ((el.type === 'img' || el.type === 'img_link') && el.imageId) { // Include img_link here
            collectedImageIds.add(el.imageId);
        }

        const textContent = el.text || '';
        const imageIdMatches = textContent.match(/Image\((\w+)\)/g);
        if (imageIdMatches) {
            imageIdMatches.forEach(match => {
                const imageId = match.match(/Image\((\w+)\)/)![1];
                collectedImageIds.add(imageId);
            });
        }
    });
    return Array.from(collectedImageIds);
}


function processArticleIntoChunks(pageObject: IPageData, nextChunkId: number): { chunks: IChunk[]; nextChunkId: number } {
    const chunks: IChunk[] = [];
    if (!pageObject || !Array.isArray(pageObject.content?.body)) return { chunks: [], nextChunkId };

    const body = pageObject.content.body;
    const header = pageObject.content.header || {};
    const common = {
        title: pageObject.title,
        url: pageObject.url,
        tags: header.tags || []
    };

    const headerImageOriginalId = header.headerImageId;
    let initialImageOriginalIds = headerImageOriginalId ? [headerImageOriginalId] : [];

    let currentEls: IPageContentBodyElement[] = [];
    let pendingImageOriginalIds: string[] = []; // Images associated with upcoming content

    let lastChunkBaseTitle: string = pageObject.title;

    const finalizeChunk = (elementsToProcess: IPageContentBodyElement[], isFirstChunk: boolean) => {
        const text = assembleChunkText(elementsToProcess);
        const ownImageOriginalIds = collectImageOriginalIdsInChunk(elementsToProcess);

        const allImageOriginalIds = Array.from(new Set([
            ...(isFirstChunk ? initialImageOriginalIds : []),
            ...pendingImageOriginalIds,
            ...ownImageOriginalIds
        ]));

        let currentChunkTitle: string = '';
        const firstHeaderInChunk = elementsToProcess.find(e => /^h[1-4]$/.test(e.type) && getCleanText(e).toLowerCase() !== 'news');

        if (firstHeaderInChunk) {
            currentChunkTitle = getCleanText(firstHeaderInChunk);
        } else {
            currentChunkTitle = lastChunkBaseTitle;
        }

        if (!text && allImageOriginalIds.length === 0) {
            return;
        }

        const currentNumericalChunkId = nextChunkId++;

        chunks.push({
            id: currentNumericalChunkId,
            url: common.url,
            title: common.title,
            chunkTitle: currentChunkTitle,
            content: text,
            images: allImageOriginalIds,
            tags: common.tags
        });

        allImageOriginalIds.forEach(imgOriginalId => {
            if (!imageUsageMap.has(imgOriginalId)) {
                imageUsageMap.set(imgOriginalId, new Set<number>());
            }
            imageUsageMap.get(imgOriginalId)!.add(currentNumericalChunkId);
        });

        if (isFirstChunk) initialImageOriginalIds = [];
        pendingImageOriginalIds = [];
        lastChunkBaseTitle = currentChunkTitle;
    };

    for (let i = 0; i < body.length; i++) {
        const el = body[i];
        const txt = getCleanText(el).toLowerCase();
        const isHr = el.type === 'hr';
        const isNewsHeader = (el.type === 'h1' || el.type === 'h2') && txt === 'news';
        const isRegularHeader = (el.type === 'h1' || el.type === 'h2' || el.type === 'h3');

        if (isHr || isNewsHeader || isRegularHeader) {
            if (currentEls.length > 0) {
                finalizeChunk(currentEls, chunks.length === 0);
                currentEls = [];
            }
            if (isHr || isNewsHeader) {
                let j = i + 1;
                while (j < body.length) {
                    const nextEl = body[j];
                    const nextElTxt = getCleanText(nextEl).toLowerCase();
                    const isNextNewsHeader = (nextEl.type === 'h1' || nextEl.type === 'h2') && nextElTxt === 'news';
                    const isNextRegularHeader = (nextEl.type === 'h1' || nextEl.type === 'h2' || nextEl.type === 'h3');
                    const isNextSeparator = nextEl.type === 'hr' || isNextNewsHeader;

                    if (isNextRegularHeader || isNextSeparator) {
                        break;
                    }

                    if ((nextEl.type === 'img' || nextEl.type === 'img_link') && nextEl.imageId) {
                        pendingImageOriginalIds.push(nextEl.imageId);
                    }
                    j++;
                }
                i = j - 1;
                if (isRegularHeader && !isNewsHeader) {
                    currentEls.push(el);
                }
            } else if (isRegularHeader) {
                currentEls.push(el);
            }
        }
        else {
            currentEls.push(el);
        }
    }

    if (currentEls.length > 0) {
        finalizeChunk(currentEls, chunks.length === 0);
    }

    return { chunks, nextChunkId };
}


async function crawlAndPreprocessMain() {
    console.log('[i] Start Cleawler');
    const startTime = process.hrtime.bigint();

    const queue: string[] = [CRAWLER_START_URL];
    while (queue.length > 0) {
        const batch = queue.splice(0, queue.length);
        await Promise.all(batch.map(url => processUrl(url, queue)));
    }

    fs.writeFileSync(CRAWLER_PAGES_OUTPUT_FILENAME, JSON.stringify({ site: CRAWLER_START_URL, crawlDate: new Date().toISOString(), pagesCount: pagesData.length, pages: pagesData.sort((a, b) => a.url.localeCompare(b.url)) }, null, 2));
    fs.writeFileSync(CRAWLER_IMAGES_OUTPUT_FILENAME, JSON.stringify({ site: CRAWLER_START_URL, crawlDate: new Date().toISOString(), imagesCount: imagesData.length, images: imagesData }, null, 2));

    const endTime = process.hrtime.bigint();
    const totalTimeMs = Number(endTime - startTime) / 1_000_000;
    const totalTimeSeconds = (totalTimeMs / 1000).toFixed(2);

    console.log('[✔] Результаты краулинга сохранены');
    console.log(`[i] Время, затраченное на краулинг: ${totalTimeSeconds} секунд.`);


    console.log('\n[i] Запуск препроцессинга...');
    const pages: IPageData[] = loadJsonFile(CRAWLER_PAGES_OUTPUT_FILENAME)?.pages || [];
    const images: IImageMeta[] = loadJsonFile(CRAWLER_IMAGES_OUTPUT_FILENAME)?.images || [];

    const originalImageIdToNumericalIdMap = new Map<string, number>();
    let nextNumericalImageId = 1;

    let allChunks: IChunk[] = [];
    let currentNextChunkId = 1;

    pages.forEach((p: IPageData) => {
        const { chunks: processedChunks, nextChunkId: updatedNextChunkId } = processArticleIntoChunks(p, currentNextChunkId);
        if (processedChunks.length) {
            allChunks.push(...processedChunks);
        }
        currentNextChunkId = updatedNextChunkId;
    });

    const originalChunkCount = allChunks.length;
    const TARGET_PHRASE = "a message from deeplearning.ai";

    const removedChunkIds = new Set<number>();
    allChunks = allChunks.filter(chunk => {
        const shouldRemove = chunk.chunkTitle && chunk.chunkTitle.toLowerCase().includes(TARGET_PHRASE);
        if (shouldRemove) {
            removedChunkIds.add(chunk.id);
        }
        return !shouldRemove;
    });

    const removedChunkCount = originalChunkCount - allChunks.length;

    if (removedChunkCount > 0) {
        console.log(`[!] Удалено ${removedChunkCount} чанков, содержащих "${TARGET_PHRASE}".`);
    }

    fs.writeFileSync(PREPROCESSOR_CHUNKS_OUTPUT_FILENAME, JSON.stringify({
        crawlDate: new Date().toISOString(),
        total: allChunks.length,
        chunks: allChunks
    }, null, 2));
    console.log(`[✔] Препроцессинг завершен: ${allChunks.length} чанков создано.`);

    const processedImages: IProcessedImage[] = [];

    images.forEach((originalImage: IImageMeta) => {
        const originalImageId = originalImage.id;
        const altText = originalImage.alt ? originalImage.alt.trim() : '';

        const isUsedByRemainingChunk = imageUsageMap.has(originalImageId) &&
            Array.from(imageUsageMap.get(originalImageId)!).some(chunkId => !removedChunkIds.has(chunkId));

        if (altText && isUsedByRemainingChunk) {
            originalImageIdToNumericalIdMap.set(originalImageId, nextNumericalImageId++);
        }
    });

    originalImageIdToNumericalIdMap.forEach((numericalId, originalId) => {
        const originalImage = images.find((img: IImageMeta) => img.id === originalId);
        if (originalImage) {
            processedImages.push({
                id: numericalId,
                originalId: originalId,
                alt: originalImage.alt.trim(),
                src: originalImage.src
            });
        }
    });

    fs.writeFileSync(PREPROCESSOR_PROCESSED_IMAGES_FILE, JSON.stringify({
        crawlDate: new Date().toISOString(),
        total: processedImages.length,
        images: processedImages
    }, null, 2));
    console.log(`[✔] Файл обработанных изображений создан: ${processedImages.length}`);
}

crawlAndPreprocessMain().catch(err => console.error('[!!!] Критическая ошибка в crawlAndPreprocess.ts:', err));