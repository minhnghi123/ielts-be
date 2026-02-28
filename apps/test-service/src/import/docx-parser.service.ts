import { Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';

// ─── Types ──────────────────────────────────────────────────────────────────

export type QuestionSignal =
    | 'multiple_choice'
    | 'fill_in_blank'
    | 'true_false_ng'
    | 'yes_no_ng'
    | 'matching_headings'
    | 'short_answer'
    | 'matching_features';

export interface ParsedAnswer {
    correctAnswers: string[];
    caseSensitive: boolean;
}

export interface ParsedQuestion {
    questionOrder: number;
    questionType: QuestionSignal;
    questionText: string;
    config: Record<string, any>;
    explanation?: string;
    answer: ParsedAnswer;
}

export interface ParsedSection {
    sectionOrder: number;
    passage?: string;
    audioFilename?: string; // filename hint — FE uploads separately
    timeLimit?: number;
    questions: ParsedQuestion[];
}

export interface ParsedWritingTask {
    taskNumber: number;
    prompt: string;
    wordLimit: number;
}

export interface ParsedSpeakingPart {
    partNumber: number;
    prompt: string;
}

export interface ParsedTest {
    skill: 'reading' | 'listening' | 'writing' | 'speaking';
    title: string;
    isMock: boolean;
    sections: ParsedSection[];           // reading / listening
    writingTasks: ParsedWritingTask[];   // writing
    speakingParts: ParsedSpeakingPart[]; // speaking
}

// ─── Signal map ─────────────────────────────────────────────────────────────

const SIGNAL_MAP: Record<string, QuestionSignal> = {
    MCQ: 'multiple_choice',
    TFNG: 'true_false_ng',
    YNTG: 'yes_no_ng',
    FILL: 'fill_in_blank',
    MATCH_HEADING: 'matching_headings',
    SHORT: 'short_answer',
    MATCH_FEATURE: 'matching_features',
};

// ─── Parser ──────────────────────────────────────────────────────────────────

@Injectable()
export class DocxParserService {
    /**
     * Entry point: convert Buffer → ParsedTest
     */
    async parse(buffer: Buffer): Promise<ParsedTest> {
        const { value: rawText } = await mammoth.extractRawText({ buffer });
        const lines = rawText
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);

        return this.parseLines(lines);
    }

    // ─── Line-by-line state machine ──────────────────────────────────────────

    private parseLines(lines: string[]): ParsedTest {
        const result: ParsedTest = {
            skill: 'reading',
            title: 'Untitled Test',
            isMock: false,
            sections: [],
            writingTasks: [],
            speakingParts: [],
        };

        let i = 0;

        // ── Header block ──────────────────────────────────────────────────────
        while (i < lines.length) {
            const line = lines[i];
            if (/^SKILL:/i.test(line)) {
                result.skill = line.split(':')[1].trim().toLowerCase() as any;
                i++;
            } else if (/^TITLE:/i.test(line)) {
                result.title = line.replace(/^TITLE:/i, '').trim();
                i++;
            } else if (/^IS_MOCK:/i.test(line)) {
                result.isMock = /true/i.test(line.split(':')[1]);
                i++;
            } else {
                break;
            }
        }

        // ── Body ─────────────────────────────────────────────────────────────
        while (i < lines.length) {
            const line = lines[i];

            // Writing tasks
            if (/^---WRITING TASK (\d+)---/i.test(line)) {
                const match = line.match(/(\d+)/);
                const taskNum = match ? parseInt(match[1], 10) : result.writingTasks.length + 1;
                i++;
                const { content, next } = this.collectUntil(lines, i, /^---END WRITING TASK/i);
                const wordLimitLine = content.find((l) => /^WORD_LIMIT:/i.test(l));
                const wordLimit = wordLimitLine
                    ? parseInt(wordLimitLine.split(':')[1].trim(), 10)
                    : 150;
                const promptLines = content.filter((l) => !/^WORD_LIMIT:/i.test(l));
                result.writingTasks.push({
                    taskNumber: taskNum,
                    prompt: promptLines.join('\n'),
                    wordLimit,
                });
                i = next;
                continue;
            }

            // Speaking parts
            if (/^---SPEAKING PART (\d+)---/i.test(line)) {
                const match = line.match(/(\d+)/);
                const partNum = match ? parseInt(match[1], 10) : result.speakingParts.length + 1;
                i++;
                const { content, next } = this.collectUntil(lines, i, /^---END SPEAKING PART/i);
                result.speakingParts.push({
                    partNumber: partNum,
                    prompt: content.join('\n'),
                });
                i = next;
                continue;
            }

            // Section header
            if (/^---SECTION (\d+)---/i.test(line)) {
                const match = line.match(/(\d+)/);
                const sectionOrder = match ? parseInt(match[1], 10) : result.sections.length + 1;
                const section: ParsedSection = {
                    sectionOrder,
                    questions: [],
                };
                result.sections.push(section);
                i++;
                continue;
            }

            // Audio URL
            if (/^---AUDIO:/i.test(line)) {
                const filename = line.replace(/^---AUDIO:/i, '').replace(/---$/, '').trim();
                if (result.sections.length > 0) {
                    result.sections[result.sections.length - 1].audioFilename = filename;
                }
                i++;
                continue;
            }

            // Passage block
            if (/^---PASSAGE---/i.test(line)) {
                i++;
                const { content, next } = this.collectUntil(lines, i, /^---END PASSAGE---/i);
                if (result.sections.length > 0) {
                    result.sections[result.sections.length - 1].passage = content.join('\n');
                }
                i = next;
                continue;
            }

            // Question type signal: [MCQ], [FILL], etc.
            const signalMatch = line.match(/^\[([A-Z_]+)\]/);
            if (signalMatch) {
                const signalKey = signalMatch[1];
                const qType = SIGNAL_MAP[signalKey];
                if (qType && result.sections.length > 0) {
                    i++;
                    i = this.parseQuestionBlock(lines, i, qType, result.sections[result.sections.length - 1]);
                    continue;
                }
            }

            // If no section yet but skill is reading/listening, auto-create section 1
            if (
                result.sections.length === 0 &&
                (result.skill === 'reading' || result.skill === 'listening')
            ) {
                result.sections.push({ sectionOrder: 1, questions: [] });
            }

            i++;
        }

        // Auto-create section 1 for writing/speaking if empty
        if (result.skill === 'reading' || result.skill === 'listening') {
            if (result.sections.length === 0) {
                result.sections.push({ sectionOrder: 1, questions: [] });
            }
        }

        return result;
    }

    // ─── Parse one question block under a [TYPE] tag ──────────────────────────

    private parseQuestionBlock(
        lines: string[],
        startIdx: number,
        qType: QuestionSignal,
        section: ParsedSection,
    ): number {
        let i = startIdx;
        const headings: string[] = [];

        // Collect "List of Headings" for matching_headings type
        if (qType === 'matching_headings') {
            if (/^List of Headings/i.test(lines[i])) {
                i++;
                while (i < lines.length && /^[ivxlcdmIVXLCDM]+\./.test(lines[i])) {
                    headings.push(lines[i]);
                    i++;
                }
            }
        }

        // Collect each numbered question until we hit another signal or section marker
        while (i < lines.length) {
            const line = lines[i];

            // Stop at another block signal
            if (/^\[([A-Z_]+)\]/.test(line) || /^---/.test(line)) break;

            // MCQ: numbered question then options then ANSWER
            if (qType === 'multiple_choice') {
                const numMatch = line.match(/^(\d+)\.\s+(.+)/);
                if (numMatch) {
                    const qNum = parseInt(numMatch[1], 10);
                    const qText = numMatch[2];
                    i++;
                    const options: string[] = [];
                    while (i < lines.length && /^[A-D]\.\s+/.test(lines[i])) {
                        const opt = lines[i].match(/^[A-D]\.\s+(.+)/);
                        if (opt) options.push(opt[1]);
                        i++;
                    }
                    let answer = '';
                    if (i < lines.length && /^ANSWER:/i.test(lines[i])) {
                        answer = lines[i].replace(/^ANSWER:/i, '').trim();
                        i++;
                    }
                    section.questions.push({
                        questionOrder: qNum,
                        questionType: qType,
                        questionText: qText,
                        config: { options },
                        answer: { correctAnswers: [answer], caseSensitive: false },
                    });
                    continue;
                }
            }

            // MATCHING_HEADINGS: "N. Paragraph X → ANSWER: ii"
            if (qType === 'matching_headings') {
                const matchLine = line.match(/^(\d+)\.\s+(.+?)\s*[→>]\s*ANSWER:\s*(.+)/i);
                if (matchLine) {
                    section.questions.push({
                        questionOrder: parseInt(matchLine[1], 10),
                        questionType: qType,
                        questionText: matchLine[2].trim(),
                        config: { headings },
                        answer: { correctAnswers: [matchLine[3].trim()], caseSensitive: false },
                    });
                    i++;
                    continue;
                }
            }

            // General: numbered question line followed by ANSWER on next line
            const numMatch = line.match(/^(\d+)\.\s+(.+)/);
            if (numMatch) {
                const qNum = parseInt(numMatch[1], 10);
                const qText = numMatch[2].trim();
                i++;
                let answer = '';
                if (i < lines.length && /^ANSWER:/i.test(lines[i])) {
                    answer = lines[i].replace(/^ANSWER:/i, '').trim();
                    i++;
                }
                section.questions.push({
                    questionOrder: qNum,
                    questionType: qType,
                    questionText: qText,
                    config: this.buildConfig(qType),
                    answer: { correctAnswers: answer ? [answer] : [], caseSensitive: false },
                });
                continue;
            }

            i++;
        }

        return i;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private collectUntil(
        lines: string[],
        startIdx: number,
        endPattern: RegExp,
    ): { content: string[]; next: number } {
        const content: string[] = [];
        let i = startIdx;
        while (i < lines.length && !endPattern.test(lines[i])) {
            content.push(lines[i]);
            i++;
        }
        return { content, next: i + 1 }; // skip the end marker line
    }

    private buildConfig(qType: QuestionSignal): Record<string, any> {
        switch (qType) {
            case 'true_false_ng':
                return { options: ['TRUE', 'FALSE', 'NOT GIVEN'] };
            case 'yes_no_ng':
                return { options: ['YES', 'NO', 'NOT GIVEN'] };
            case 'fill_in_blank':
            case 'short_answer':
                return {};
            default:
                return {};
        }
    }
}
