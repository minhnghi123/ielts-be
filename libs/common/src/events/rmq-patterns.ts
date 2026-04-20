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
