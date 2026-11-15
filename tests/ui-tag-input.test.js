import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.parentElement = null;
    this._id = '';
  }

  get id() {
    return this._id;
  }

  set id(value) {
    this._id = String(value);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this._id = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node != null && typeof node === 'object') node.parentElement = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  addEventListener(type, listener, options = {}) {
    const list = this.listeners.get(type) ?? [];
    list.push({ listener, signal: options?.signal });
    this.listeners.set(type, list);
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
  }

  dispatch(type, event = {}) {
    for (const { listener, signal } of this.listeners.get(type) ?? []) {
      if (signal?.aborted) continue;
      listener({ preventDefault() {}, ...event });
    }
  }
}

globalThis.document = {
  body: new FakeNode('body'),
  createElement: (tag) => new FakeNode(tag),
  createElementNS: (_namespace, tag) => new FakeNode(tag),
  createTextNode: (text) => {
    const node = new FakeNode('#text');
    node.textContent = text;
    return node;
  },
  getElementById: () => null,
};

const { createTagInput } = await import('../src/lib/ui.js');

test('re-creating the tag input on one element leaves the newest instance authoritative', () => {
  const field = new FakeNode('div');
  const input = new FakeNode('input');
  input.id = 'tag-input';
  input.parentElement = field;
  const chips = new FakeNode('div');

  createTagInput({ input, chips, initial: ['alpha'], exclude: ['bookmarks'] });
  const second = createTagInput({ input, chips, initial: ['alpha'], exclude: ['bookmarks'] });

  input.value = 'beta';
  input.dispatch('keydown', { key: 'Enter' });

  assert.deepEqual(second.getTags(), ['alpha', 'beta']);
  assert.equal(input.value, '');
  assert.deepEqual(
    chips.children.map((chip) => chip.children[0]?.textContent),
    ['alpha', 'beta'],
  );
});

test('a tag committed from the input is not dropped when the input is re-wired', () => {
  const field = new FakeNode('div');
  const input = new FakeNode('input');
  input.parentElement = field;
  const chips = new FakeNode('div');

  createTagInput({ input, chips, initial: [], exclude: ['bookmarks'] });
  const controller = createTagInput({ input, chips, initial: [], exclude: ['bookmarks'] });

  input.value = 'one, two';
  input.dispatch('keydown', { key: ',' });

  assert.deepEqual(controller.getTags(), ['one', 'two']);
});
