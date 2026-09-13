import { describe, expect, it } from 'vitest';
import {
	isValidBaseUrl,
	isValidTimeRange,
	normalizeBaseUrl,
	normalizeDataset,
	normalizeEvents,
	renderSqlQuery,
} from './Parseable.node';
describe('Parseable helpers', () => {
	it('removes trailing slashes', () =>
		expect(normalizeBaseUrl('https://example.com///')).toBe('https://example.com'));
	it('wraps one event', () =>
		expect(normalizeEvents({ message: 'hello' })).toEqual([{ message: 'hello' }]));
	it('preserves arrays', () => {
		const events = [{ message: 'one' }];
		expect(normalizeEvents(events)).toBe(events);
	});
	it('injects a safely quoted dataset into SQL', () => {
		expect(renderSqlQuery('SELECT * FROM {{dataset}}', 'team"logs')).toBe(
			'SELECT * FROM "team""logs"',
		);
	});
	it('requires the dataset placeholder in SQL', () => {
		expect(renderSqlQuery('SELECT 1', 'logs')).toBeUndefined();
	});
	it('validates HTTP base URLs and rejects embedded credentials or fragments', () => {
		expect(isValidBaseUrl('https://query.example.com/prefix')).toBe(true);
		expect(isValidBaseUrl('ftp://query.example.com')).toBe(false);
		expect(isValidBaseUrl('https://user:secret@query.example.com')).toBe(false);
		expect(isValidBaseUrl('https://query.example.com#fragment')).toBe(false);
	});
	it('normalizes dataset whitespace and rejects empty or control characters', () => {
		expect(normalizeDataset('  app-logs  ')).toBe('app-logs');
		expect(normalizeDataset('   ')).toBeUndefined();
		expect(normalizeDataset('app\nlogs')).toBeUndefined();
	});
	it('rejects invalid event payloads', () => {
		expect(normalizeEvents([])).toBeUndefined();
		expect(normalizeEvents([{}])).toEqual([{}]);
		expect(normalizeEvents(['not-an-object'])).toBeUndefined();
		expect(normalizeEvents(null)).toBeUndefined();
	});
	it('validates ordered date ranges', () => {
		expect(isValidTimeRange('2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z')).toBe(true);
		expect(isValidTimeRange('2026-01-01T02:00:00Z', '2026-01-01T01:00:00Z')).toBe(false);
		expect(isValidTimeRange('invalid', '2026-01-01T01:00:00Z')).toBe(false);
	});
});
