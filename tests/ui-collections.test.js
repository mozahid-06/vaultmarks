import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectionOptions } from '../src/lib/ui.js';

test('collection options show the full nested path', () => {
  const index = {
    collections: [
      {
        path: 'Entertainment',
        name: 'Entertainment',
        children: [
          { path: 'Entertainment/Anime & Series', name: 'Anime & Series', children: [] },
          { path: 'Entertainment/Music', name: 'Music', children: [] },
        ],
      },
      { path: 'Learning', name: 'Learning', children: [] },
    ],
  };

  assert.deepEqual(collectionOptions(index), [
    { value: '', label: 'Unfiled' },
    { value: 'Entertainment', label: 'Entertainment' },
    { value: 'Entertainment/Anime & Series', label: 'Entertainment/Anime & Series' },
    { value: 'Entertainment/Music', label: 'Entertainment/Music' },
    { value: 'Learning', label: 'Learning' },
  ]);
  assert.deepEqual(collectionOptions(null), [{ value: '', label: 'Unfiled' }]);
});
