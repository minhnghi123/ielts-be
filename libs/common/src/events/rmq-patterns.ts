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
};

/**
 * One queue per consuming service. With a shared queue RabbitMQ round-robins
 * messages between all consumers, so e.g. a `grading.*` command could be
 * delivered to the analytics service, which has no handler for it.
 */
export const RMQ_QUEUES = {
    TEST: 'ielts.test',
    SUBMISSION: 'ielts.submission',
    ANALYTICS: 'ielts.analytics',
} as const;

export const RMQ_CLIENTS = {
    TEST: 'TEST_RMQ_CLIENT',
    SUBMISSION: 'SUBMISSION_RMQ_CLIENT',
    ANALYTICS: 'ANALYTICS_RMQ_CLIENT',
} as const;

export function rmqUrls(): string[] {
    return [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'];
}
