import * as dotenv from 'dotenv';
dotenv.config();
import { z } from "zod";
import * as fs from 'fs/promises';
import * as path from 'path';

import { llm } from '../infrastructure/langchain/langchainModels';
import { getRAGChain } from "../infrastructure/langchain/ragChain";

const trustworthinessInstructions = `You are a teacher grading a quiz.

You will be given a QUESTION, the GROUND TRUTH (correct) ANSWER, and the STUDENT ANSWER (generated).

Here are the grading criteria to follow:
(1) Grade the student's content based ONLY on its factual accuracy relative to the ground truth content.
(2) Ensure that the student's content does not contain any conflicting statements.
(3) It is OK if the student's content contains more information than the ground truth content, as long as it is factually accurate relative to the ground truth content.

Correctness (Trustworthiness):
A correctness value of True means that the student's content meets all of the criteria.
A correctness value of False means that the student's content does not meet all of the criteria.

Explain your reasoning in a step-by-step manner to ensure your reasoning and conclusion are correct.

Avoid simply stating the correct content at the outset.`;

const structuredTrustworthinessGraderLLM = llm.withStructuredOutput(
    z
        .object({
            explanation: z
                .string()
                .describe("Explain your reasoning for the trustworthiness (correctness) score"),
            score: z
                .boolean()
                .describe("True if the answer content is correct, False otherwise.")
        })
        .describe("Trustworthiness (correctness) score for generated content versus ground truth.")
);

async function evaluateTrustworthiness({
                                           question,
                                           groundTruthAnswer,
                                           studentAnswer,
                                       }: {
    question: string;
    groundTruthAnswer: string;
    studentAnswer: string;
}): Promise<{ explanation: string; score: boolean }> {
    const content = `QUESTION: ${question}
    GROUND TRUTH ANSWER: ${groundTruthAnswer}
    STUDENT ANSWER: ${studentAnswer}`;

    const grade = await structuredTrustworthinessGraderLLM.invoke([
        { role: "system", content: trustworthinessInstructions },
        { role: "user", content: content }
    ]);

    return grade;
}

const answerRelevancyInstructions = `You are a grader evaluating the relevancy of a generated answer to a question.

You will be given a QUESTION and a GENERATED ANSWER.

Here are the grading criteria:
(1) Evaluate if the GENERATED ANSWER directly addresses the QUESTION.
(2) Ignore any factual inaccuracies for this evaluation; focus solely on whether the answer attempts to directly answer the question.
(3) The answer should not be vague or provide irrelevant information.

Relevancy:
A relevancy value of True means that the GENERATED ANSWER is directly relevant to the QUESTION.
A relevancy value of False means that the GENERATED ANSWER is not directly relevant to the QUESTION, or is vague/irrelevant.

Explain your reasoning in a step-by-step manner.`;

const structuredAnswerRelevancyGraderLLM = llm.withStructuredOutput(
    z.object({
        explanation: z.string().describe("Explain your reasoning for the answer relevancy score"),
        score: z.boolean().describe("True if the answer is relevant, False otherwise.")
    })
);

async function evaluateAnswerRelevancy({
                                           question,
                                           studentAnswer,
                                       }: {
    question: string;
    studentAnswer: string;
}): Promise<{ explanation: string; score: boolean }> {
    const content = `QUESTION: ${question}
    GENERATED ANSWER: ${studentAnswer}`;

    const grade = await structuredAnswerRelevancyGraderLLM.invoke([
        { role: "system", content: answerRelevancyInstructions },
        { role: "user", content: content }
    ]);

    return grade;
}

async function writeEvaluationLog(message: string): Promise<void> {
    const logDir = path.resolve(__dirname, '../../Data/log');
    await fs.mkdir(logDir, { recursive: true });

    let n = 0;
    let logFilePath: string;
    do {
        logFilePath = path.join(logDir, `evaluationlog_${n}.log`);
        n++;
    } while (await fs.access(logFilePath).then(() => true).catch(() => false));

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    try {
        await fs.appendFile(logFilePath, logEntry, 'utf8');
        console.log(`[LOG] Writing to log: ${logFilePath}`);
    } catch (error) {
        console.error(`[!!!] Error writing log to ${logFilePath}:`, error);
    }
}


interface DatasetExample {
    inputs: {
        input: string;
    };
    outputs: {
        output: string;
    };
}

interface CustomEvaluationResult {
    trustworthinessScore: number;
    trustworthinessComment: string;
    answerRelevancyScore: number;
    answerRelevancyComment: string;
    question: string;
    groundTruthAnswer: string;
    studentAnswer: string;
    exampleIndex: number;
}

export async function runEvaluation() {
    console.log(`Loading local dataset...`);
    await writeEvaluationLog('Starting local dataset loading.');

    const filePath = path.join(__dirname, '../../../Data/langsmith_output_nested.jsonl');
    let datasetExamples: DatasetExample[] = [];

    try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        datasetExamples = fileContent.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => JSON.parse(line));
    } catch (error) {
        console.error(`Error reading or parsing data file: ${(error as Error).message}`);
        await writeEvaluationLog(`Error reading or parsing data file: ${(error as Error).message}`);
        return;
    }

    console.log(`Local dataset loaded. Found ${datasetExamples.length} examples.`);
    await writeEvaluationLog(`Local dataset loaded. Found ${datasetExamples.length} examples.`);

    const numberOfExamplesToTest = 100;
    const shuffledExamples = datasetExamples.sort(() => 0.5 - Math.random());
    const selectedExamples = shuffledExamples.slice(0, Math.min(numberOfExamplesToTest, datasetExamples.length));

    console.log(`Selected ${selectedExamples.length} random examples for testing.`);
    await writeEvaluationLog(`Selected ${selectedExamples.length} random examples for testing.`);

    const results: CustomEvaluationResult[] = [];
    let processedCount = 0;

    const ragChainInstance = await getRAGChain();

    for (const example of selectedExamples) {
        processedCount++;
        console.log(`Processing example ${processedCount}/${selectedExamples.length}...`);
        await writeEvaluationLog(`Processing example ${processedCount}/${selectedExamples.length}...`);

        const question = example.inputs.input;
        const groundTruthAnswer = example.outputs.output;
        let studentAnswer = "N/A";

        if (!question || !groundTruthAnswer) {
            console.warn(`Skipping malformed example at index: ${processedCount}`);
            await writeEvaluationLog(`Skipping malformed example at index: ${processedCount}`);
            continue;
        }

        try {
            console.log(`  Invoking RAG Chain for question: ${question}`);
            await writeEvaluationLog(`Invoking RAG Chain for question: "${question}"`);
            const ragResult = await ragChainInstance.invoke({ question: question });

            studentAnswer = ragResult.answer || "N/A";

            const trustworthinessGrade = await evaluateTrustworthiness({
                question: question,
                groundTruthAnswer: groundTruthAnswer,
                studentAnswer: studentAnswer,
            });

            const answerRelevancyGrade = await evaluateAnswerRelevancy({
                question: question,
                studentAnswer: studentAnswer,
            });

            results.push({
                trustworthinessScore: trustworthinessGrade.score ? 1 : 0,
                trustworthinessComment: trustworthinessGrade.explanation,
                answerRelevancyScore: answerRelevancyGrade.score ? 1 : 0,
                answerRelevancyComment: answerRelevancyGrade.explanation,
                question: question,
                groundTruthAnswer: groundTruthAnswer,
                studentAnswer: studentAnswer,
                exampleIndex: processedCount - 1,
            });

            const logMessage = `  Question: ${question}\n` +
                `  Generated Answer (from RAG): ${studentAnswer}\n` +
                `  Ground Truth Answer: ${groundTruthAnswer}\n` +
                `  Trustworthiness (Correctness): ${trustworthinessGrade.score ? "True" : "False"} - ${trustworthinessGrade.explanation}\n` +
                `  Answer Relevancy: ${answerRelevancyGrade.score ? "True" : "False"} - ${answerRelevancyGrade.explanation}`;
            console.log(logMessage);
            await writeEvaluationLog(logMessage);

        } catch (error) {
            console.error(`Error processing example ${processedCount}: ${(error as Error).message}`);
            await writeEvaluationLog(`Error processing example ${processedCount}: ${(error as Error).message}`);
            results.push({
                trustworthinessScore: 0,
                trustworthinessComment: `Error during RAG chain invocation or evaluation: ${(error as Error).message}`,
                answerRelevancyScore: 0,
                answerRelevancyComment: `Error during evaluation: ${(error as Error).message}`,
                question: question,
                groundTruthAnswer: groundTruthAnswer,
                studentAnswer: studentAnswer,
                exampleIndex: processedCount - 1,
            });
        }
    }

    console.log(`\n--- Evaluation Summary ---`);
    await writeEvaluationLog('--- Evaluation Summary ---');
    console.log(`Total examples processed (from selected ${selectedExamples.length}): ${results.length}`);
    await writeEvaluationLog(`Total examples processed (from selected ${selectedExamples.length}): ${results.length}`);

    const totalTrustworthinessScore = results.reduce((sum, r) => sum + r.trustworthinessScore, 0);
    const trustworthinessPercentage = (totalTrustworthinessScore / results.length) * 100;
    console.log(`Average Trustworthiness (Correctness) Score: ${trustworthinessPercentage.toFixed(2)}%`);
    await writeEvaluationLog(`Average Trustworthiness (Correctness) Score: ${trustworthinessPercentage.toFixed(2)}%`);

    const totalAnswerRelevancyScore = results.reduce((sum, r) => sum + r.answerRelevancyScore, 0);
    const answerRelevancyPercentage = (totalAnswerRelevancyScore / results.length) * 100;
    console.log(`Average Answer Relevancy Score: ${answerRelevancyPercentage.toFixed(2)}%`);
    await writeEvaluationLog(`Average Answer Relevancy Score: ${answerRelevancyPercentage.toFixed(2)}%`);

    console.log(`\n--- Detailed Results ---`);
    await writeEvaluationLog('--- Detailed Results ---');
    for (const [index, r] of results.entries()) {
        const detailedLog = `\nExample ${index + 1} (Original Dataset Index: ${r.exampleIndex}):\n` +
            `  Question: ${r.question}\n` +
            `  Generated Answer: ${r.studentAnswer}\n` +
            `  Ground Truth Answer: ${r.groundTruthAnswer}\n` +
            `  Trustworthiness (Correctness): ${r.trustworthinessScore === 1 ? "True" : "False"} - ${r.trustworthinessComment}\n` +
            `  Answer Relevancy: ${r.answerRelevancyScore === 1 ? "True" : "False"} - ${r.answerRelevancyComment}`;
        console.log(detailedLog);
        await writeEvaluationLog(detailedLog);
    }
}

runEvaluation().catch(console.error);