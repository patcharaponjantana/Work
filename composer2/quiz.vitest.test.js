import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const quiz = require('./quiz.cjs');

describe('RetargetQuiz', () => {
  it('reports correct answers with isCorrect', () => {
    expect(quiz.isCorrect('q1', 'a')).toBe(true);
    expect(quiz.isCorrect('q1', 'b')).toBe(false);
    expect(quiz.isCorrect('missing', 'a')).toBe(false);
  });

  it('grades a perfect quiz', () => {
    const answers = Object.fromEntries(quiz.QUIZ_QUESTIONS.map((q) => [q.id, q.correctChoiceId]));
    const result = quiz.gradeQuiz(answers);
    expect(result.correct).toBe(quiz.QUIZ_QUESTIONS.length);
    expect(result.total).toBe(quiz.QUIZ_QUESTIONS.length);
    expect(result.fraction).toBe(1);
    expect(result.details.every((d) => d.correct)).toBe(true);
  });

  it('grades missed or unanswered questions', () => {
    const answers = { q1: 'a' };
    const result = quiz.gradeQuiz(answers);
    expect(result.correct).toBe(1);
    expect(result.total).toBe(quiz.QUIZ_QUESTIONS.length);
    expect(result.details.find((d) => d.questionId === 'q2')?.correct).toBe(false);
  });

  it('getQuestion returns metadata', () => {
    const q = quiz.getQuestion('q3');
    expect(q).not.toBeNull();
    expect(q?.choices.length).toBeGreaterThan(0);
    expect(q?.correctChoiceId).toBeDefined();
  });
});
