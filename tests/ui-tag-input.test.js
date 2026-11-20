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

  removeAttribute(name) {
    delete this.attributes[name];
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

function setup({ initial = [], suggestions = [], exclude = [] } = {}) {
  const field = new FakeNode('div');
  const input = new FakeNode('input');
  input.id = 'tag-input';
  field.append(input);
  const chips = new FakeNode('div');
  const handle = createTagInput({ input, chips, initial, suggestions, exclude });
  const menu = field.children.find((child) => child.className === 'tag-menu');
  return { field, input, chips, handle, menu };
}

const label = (node) => node.textContent || node.children.map((child) => child.textContent).filter(Boolean).join(' ');

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

test('typing filters the tag suggestions', () => {
  const { input, menu } = setup({ suggestions: ['React', 'Reading', 'Vim'] });

  input.value = 're';
  input.dispatch('input');

  assert.equal(menu.hidden, false);
  assert.deepEqual(menu.children.map(label), ['React', 'Reading', 'Create “re”']);
});

test('an exact match is selected with its stored casing', () => {
  const { input, handle, menu } = setup({ suggestions: ['React', 'Vim'] });

  input.value = 'REACT';
  input.dispatch('input');
  assert.deepEqual(menu.children.map(label), ['React']);
  assert.equal(input.getAttribute('aria-activedescendant'), menu.children[0].id);

  input.dispatch('keydown', { key: 'Enter' });

  assert.deepEqual(handle.getTags(), ['React']);
  assert.equal(input.value, '');
  assert.equal(menu.hidden, true);
});

test('typing an unknown tag offers a create row and Enter creates it', () => {
  const { input, handle, menu } = setup({ suggestions: ['React', 'Reading'] });

  input.value = 'zig';
  input.dispatch('input');
  assert.deepEqual(menu.children.map(label), ['No tags match “zig”', 'Create “zig”']);

  input.dispatch('keydown', { key: 'Enter' });

  assert.deepEqual(handle.getTags(), ['zig']);
  assert.equal(menu.hidden, true);
});

test('arrow keys move the active option', () => {
  const { input, menu } = setup({ suggestions: ['React', 'Reading'] });

  input.value = 're';
  input.dispatch('input');
  input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(menu.children[0].className, 'tag-option active');

  input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(menu.children[1].className, 'tag-option active');
  assert.equal(menu.children[0].className, 'tag-option');
});

test('clicking a suggestion selects that suggestion', () => {
  const { input, handle, menu } = setup({ suggestions: ['React', 'Reading'] });

  input.value = 'rea';
  input.dispatch('input');
  const target = menu.children[1];
  target.dispatch('pointerdown');

  assert.deepEqual(handle.getTags(), ['Reading']);
  assert.equal(input.value, '');
});

test('selected and excluded tags are not offered again', () => {
  const { input, menu } = setup({
    initial: ['Alpha'],
    suggestions: ['Alpha', 'Beta', 'bookmarks'],
    exclude: ['bookmarks'],
  });

  input.dispatch('focus');

  assert.deepEqual(menu.children.map(label), ['Beta']);
});

test('Escape closes the menu without committing', () => {
  const { input, handle, menu } = setup({ suggestions: ['React'] });

  input.value = 'rea';
  input.dispatch('input');
  input.dispatch('keydown', { key: 'Escape' });

  assert.equal(menu.hidden, true);
  assert.deepEqual(handle.getTags(), []);
  assert.equal(input.value, 'rea');
});

test('re-wiring leaves a single menu on the field', () => {
  const { field, input, chips } = setup({ suggestions: ['React'] });

  createTagInput({ input, chips, suggestions: ['React'] });

  assert.equal(field.children.filter((child) => child.className === 'tag-menu').length, 1);
});
