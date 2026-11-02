export const RMQ_PATTERNS = {
    // Analytics (Pub/Sub)
    ANALYTICS: {
        TEST_SUBMITTED: 'analytics.test.submitted',
    },
    // Grading (Commands/RPC)
    GRADING: {
        GRADE_WRITING: 'grading.grade_writing',
        GRADE_SPEAKING: 'grading.grade_speaking',
    },
    // Test Information (RPC)
    TEST: {
        GET_ANSWERS: 'test.get_answers',
        GET_SKILL: 'test.get_skill',
    },
    // Classroom (Pub/Sub) — emitted by test-service for attempts linked to an assignment
    CLASSROOM: {
        ATTEMPT_SUBMITTED: 'classroom.attempt.submitted',
        ATTEMPT_GRADED: 'classroom.attempt.graded',
    },
};

export interface ClassroomAttemptEvent {
    attemptId: string;
    assignmentId: string;
    learnerId: string;
    testId: string;
    skill: string | null;
    status: string;
    attemptNo: number;
    rawScore: number | null;
    bandScore: number | null;
    startedAt: string;
    submittedAt: string | null;
    expiresAt: string | null;
}

/**
 * One queue per consuming service. With a shared queue RabbitMQ round-robins
 * messages between all consumers, so e.g. a `grading.*` command could be
 * delivered to the analytics service, which has no handler for it.
 */
export const RMQ_QUEUES = {
    TEST: 'ielts.test',
    SUBMISSION: 'ielts.submission',
    ANALYTICS: 'ielts.analytics',
    CLASSROOM: 'ielts.classroom',
} as const;

export const RMQ_CLIENTS = {
    TEST: 'TEST_RMQ_CLIENT',
    SUBMISSION: 'SUBMISSION_RMQ_CLIENT',
    ANALYTICS: 'ANALYTICS_RMQ_CLIENT',
    CLASSROOM: 'CLASSROOM_RMQ_CLIENT',
} as const;

export function rmqUrls(): string[] {
    return [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'];
}
