import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['quiz.vitest.test.js'],
    environment: 'node',
  },
});
