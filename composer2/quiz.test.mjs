/**
 * Runs with: node --test quiz.test.mjs
 * (No npm required — uses Node's built-in test runner.)
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const quiz = require('./quiz.cjs');

describe('RetargetQuiz', () => {
  it('reports correct answers with isCorrect', () => {
    assert.equal(quiz.isCorrect('q1', 'a'), true);
    assert.equal(quiz.isCorrect('q1', 'b'), false);
    assert.equal(quiz.isCorrect('missing', 'a'), false);
  });

  it('grades a perfect quiz', () => {
    const answers = Object.fromEntries(quiz.QUIZ_QUESTIONS.map((q) => [q.id, q.correctChoiceId]));
    const result = quiz.gradeQuiz(answers);
    assert.equal(result.correct, quiz.QUIZ_QUESTIONS.length);
    assert.equal(result.total, quiz.QUIZ_QUESTIONS.length);
    assert.equal(result.fraction, 1);
    assert.ok(result.details.every((d) => d.correct));
  });

  it('grades missed or unanswered questions', () => {
    const answers = { q1: 'a' };
    const result = quiz.gradeQuiz(answers);
    assert.equal(result.correct, 1);
    assert.equal(result.total, quiz.QUIZ_QUESTIONS.length);
    assert.equal(result.details.find((d) => d.questionId === 'q2')?.correct, false);
  });

  it('getQuestion returns metadata', () => {
    const q = quiz.getQuestion('q3');
    assert.notEqual(q, null);
    assert.ok(q && q.choices.length > 0);
    assert.ok(q && q.correctChoiceId);
  });
});
