import { describe, expect, it } from 'vitest';
import { leadPerformer, performersByRole, roleLabel, type Performer } from '../src/index.js';

const bill: Performer[] = [
  { name: 'Opener', role: 'support' },
  { name: 'MC', role: 'host' },
  { name: 'Big Name', role: 'headliner' },
  { name: 'Second Opener', role: 'support' },
];

describe('performers', () => {
  it('roleLabel knows the contract roles and title-cases the rest', () => {
    expect(roleLabel('dj')).toBe('DJ');
    expect(roleLabel('Author')).toBe('Author');
    expect(roleLabel('puppeteer')).toBe('Puppeteer');
    expect(roleLabel('')).toBe('Performer');
  });

  it('leadPerformer prefers the headliner, then a non-support/host, then the first', () => {
    expect(leadPerformer(bill)?.name).toBe('Big Name');
    expect(leadPerformer([{ name: 'A', role: 'support' }, { name: 'B', role: 'performer' }])?.name).toBe('B');
    expect(leadPerformer([{ name: 'A', role: 'support' }, { name: 'H', role: 'host' }])?.name).toBe('A');
    expect(leadPerformer([])).toBeNull();
  });

  it('performersByRole groups in role order and pluralises labels', () => {
    const groups = performersByRole([...bill, { name: 'X', role: 'puppeteer' }]);
    expect(groups.map((g) => g.role)).toEqual(['headliner', 'support', 'host', 'puppeteer']);
    expect(groups.map((g) => g.label)).toEqual(['Headliner', 'Support', 'Host', 'Puppeteer']);
    expect(groups[1]!.people.map((p) => p.name)).toEqual(['Opener', 'Second Opener']);
    expect(performersByRole([{ name: 'A', role: 'author' }, { name: 'B', role: 'author' }])[0]!.label).toBe('Authors');
    expect(performersByRole([])).toEqual([]);
  });
});
