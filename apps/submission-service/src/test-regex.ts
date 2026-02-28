function evaluateAnswer(userAnswer: string, correctAnswerRule: string, caseSensitive: boolean): boolean {
    const rules = correctAnswerRule.split('[OR]').map((r) => r.trim());

    for (const rule of rules) {
        // Convert the rule into a robust regex
        let regexPattern = rule
            // Escape special regex characters except parentheses
            .replace(/[-[\]{}*+?.,\\^$|#]/g, '\\$&')
            // Replace \( ... \) with an optional non-capturing group.
            // We append a ? to make it optional.
            .replace(/\((.*?)\)/g, '(?:$1)?');

        // Allow flexible whitespace matching (any run of spaces matches any whitespace)
        // Also collapse multiple spaces
        regexPattern = regexPattern.replace(/\s+/g, '\\s*');
        // Ensure exact string match from start to end (allowing surrounding whitespace)
        regexPattern = `^\\s*${regexPattern}\\s*$`;

        try {
            const regex = new RegExp(regexPattern, caseSensitive ? '' : 'i');
            if (regex.test(userAnswer)) {
                return true;
            }
        } catch (e) {
            // Fallback to basic string comparison if regex parsing fails
            const ruleText = rule.replace(/[()]/g, '');
            const compareUser = caseSensitive ? userAnswer.trim() : userAnswer.trim().toLowerCase();
            const compareRule = caseSensitive ? ruleText : ruleText.toLowerCase();
            if (compareUser === compareRule) {
                return true;
            }
        }
    }

    return false;
}

const testCases = [
    { rule: "(FREDERICK) FLEET", user: "FLEET", expect: true },
    { rule: "(FREDERICK) FLEET", user: "FREDERICK FLEET", expect: true },
    { rule: "(FREDERICK) FLEET", user: "FREDERICKFLEET", expect: false },
    { rule: "(FREDERICK) FLEET", user: "FRED FLEET", expect: false },
    { rule: "MIDNIGHT [OR] 12(.00) A.M. [OR] 12(.00) AM", user: "MIDNIGHT", expect: true },
    { rule: "MIDNIGHT [OR] 12(.00) A.M. [OR] 12(.00) AM", user: "12 A.M.", expect: true },
    { rule: "MIDNIGHT [OR] 12(.00) A.M. [OR] 12(.00) AM", user: "12.00 A.M.", expect: true },
    { rule: "MIDNIGHT [OR] 12(.00) A.M. [OR] 12(.00) AM", user: "12 AM", expect: true },
    { rule: "MIDNIGHT [OR] 12(.00) A.M. [OR] 12(.00) AM", user: "12.00 AM", expect: true },
    { rule: "MIDNIGHT [OR] 12(.00) A.M. [OR] 12(.00) AM", user: "12.00AM", expect: false }, // expects space
];

testCases.forEach((tc, i) => {
    const res = evaluateAnswer(tc.user, tc.rule, false);
    console.log(`Test ${i + 1}: [Rule: "${tc.rule}", User: "${tc.user}"] -> ${res === tc.expect ? 'PASS' : 'FAIL'} (Got ${res}, Expected ${tc.expect})`);
});
