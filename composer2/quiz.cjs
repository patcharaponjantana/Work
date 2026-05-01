/**
 * Quiz data and pure grading helpers for the retargeting tutorial.
 * Browser: attaches RetargetQuiz to globalThis. Node/Vitest: module.exports.
 * Uses .cjs so tests can require() it while package.json has "type": "module".
 */
(function attachRetargetQuiz(root) {
  'use strict';

  /** @typedef {{ id: string; prompt: string; choices: { id: string; label: string }[]; correctChoiceId: string }} QuizQuestion */

  /** @type {QuizQuestion[]} */
  var QUIZ_QUESTIONS = [
    {
      id: 'q1',
      prompt:
        'Animation retargeting primarily lets you:',
      choices: [
        { id: 'a', label: 'Reuse motion from one skeleton on another with different proportions or conventions.' },
        { id: 'b', label: 'Automatically fix bad topology on a character mesh.' },
        { id: 'c', label: 'Increase texture resolution without rebaking.' },
      ],
      correctChoiceId: 'a',
    },
    {
      id: 'q2',
      prompt:
        'Why is a consistent bind (reference) pose important before retargeting?',
      choices: [
        { id: 'a', label: 'So rotations from the source clip line up meaningfully on the target hierarchy.' },
        { id: 'b', label: 'So vertex normals face the same direction as the sky.' },
        { id: 'c', label: 'So LOD meshes disappear at the same distance.' },
      ],
      correctChoiceId: 'a',
    },
    {
      id: 'q3',
      prompt:
        'A bone map connects:',
      choices: [
        { id: 'a', label: 'Logical joints on the source skeleton to matching joints on the target skeleton.' },
        { id: 'b', label: 'Material slots to physics layers.' },
        { id: 'c', label: 'Keyframes only within the same frame rate.' },
      ],
      correctChoiceId: 'a',
    },
    {
      id: 'q4',
      prompt:
        'When skeleton proportions differ, blindly copying joint translations from mocap often causes:',
      choices: [
        { id: 'a', label: 'Feet floating or penetrating the ground, and stretched interiors at joints.' },
        { id: 'b', label: 'Higher draw calls per frame.' },
        { id: 'c', label: 'HDR bloom to disable itself.' },
      ],
      correctChoiceId: 'a',
    },
    {
      id: 'q5',
      prompt:
        'Root motion typically refers to:',
      choices: [
        { id: 'a', label: 'Translational locomotion driven by the root or hips so the character actually travels through the world.' },
        { id: 'b', label: 'Rotating only finger bones for polish.' },
        { id: 'c', label: 'Blending two additive layers by wrist twist.' },
      ],
      correctChoiceId: 'a',
    },
    {
      id: 'q6',
      prompt:
        'Foot IK during locomotion is often used to:',
      choices: [
        { id: 'a', label: 'Reduce foot sliding and maintain plant contacts after retarget approximations.' },
        { id: 'b', label: 'Bake ambient occlusion into vertex colors.' },
        { id: 'c', label: 'Replace the need for any bone hierarchy.' },
      ],
      correctChoiceId: 'a',
    },
    {
      id: 'q7',
      prompt:
        'Twist or helper bones in a rig usually:',
      choices: [
        { id: 'a', label: 'Improve deformation volume preservation and may need explicit mapping or suppression during retarget.' },
        { id: 'b', label: 'Store morph target deltas for facial animation.' },
        { id: 'c', label: 'Define which skeleton is the master clock for networking.' },
      ],
      correctChoiceId: 'a',
    },
  ];

  /**
   * @param {string} questionId
   * @param {string} choiceId
   */
  function isCorrect(questionId, choiceId) {
    var q = QUIZ_QUESTIONS.find(function (x) {
      return x.id === questionId;
    });
    if (!q) return false;
    return q.correctChoiceId === choiceId;
  }

  /**
   * @param {Record<string, string>} answers questionId -> selected choiceId
   */
  function gradeQuiz(answers) {
    var correct = 0;
    var total = QUIZ_QUESTIONS.length;
    var details = QUIZ_QUESTIONS.map(function (q) {
      var picked = answers[q.id];
      var ok = picked != null && isCorrect(q.id, picked);
      if (ok) correct += 1;
      return {
        questionId: q.id,
        pickedChoiceId: picked == null ? null : picked,
        correct: ok,
        correctChoiceId: q.correctChoiceId,
      };
    });
    return {
      correct: correct,
      total: total,
      fraction: total === 0 ? 0 : correct / total,
      details: details,
    };
  }

  /**
   * @param {string} questionId
   */
  function getQuestion(questionId) {
    return QUIZ_QUESTIONS.find(function (q) {
      return q.id === questionId;
    }) || null;
  }

  var api = {
    QUIZ_QUESTIONS: QUIZ_QUESTIONS,
    isCorrect: isCorrect,
    gradeQuiz: gradeQuiz,
    getQuestion: getQuestion,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    module.exports.default = api;
  }
  root.RetargetQuiz = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
