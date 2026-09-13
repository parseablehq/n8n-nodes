import { describe, expect, it, vi } from 'vitest';
import type { IExecuteFunctions, INode } from 'n8n-workflow';
import { Parseable } from './Parseable.node';

const node: INode = {
	id: 'parseable-1',
	name: 'Parseable',
	type: 'n8n-nodes-parseable.parseable',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

function executionContext(parameters: Record<string, unknown>, response: unknown) {
	const request = vi.fn().mockResolvedValue(response);
	const context = {
		getInputData: () => [{ json: { input: true } }],
		getCredentials: vi.fn().mockResolvedValue({
			queryBaseUrl: 'https://query.example.com/',
			ingestBaseUrl: 'https://ingest.example.com/',
			apiKey: 'px_test',
		}),
		getNodeParameter: (name: string) => parameters[name],
		getNode: () => node,
		continueOnFail: () => false,
		helpers: { httpRequestWithAuthentication: request },
	};
	return { context: context as unknown as IExecuteFunctions, request };
}

describe('Parseable node execution', () => {
	it('queries SQL through the query URL and returns paired rows', async () => {
		const { context, request } = executionContext(
			{
				operation: 'querySql',
				dataset: 'app-logs',
				query: 'SELECT * FROM {{dataset}}',
				startTime: '2026-01-01T00:00:00Z',
				endTime: '2026-01-01T01:00:00Z',
			},
			[{ message: 'ok' }],
		);
		const result = await Parseable.prototype.execute.call(context);
		expect(request).toHaveBeenCalledWith('parseableApi', {
			method: 'POST',
			url: 'https://query.example.com/api/v1/query',
			body: {
				query: 'SELECT * FROM "app-logs"',
				startTime: '2026-01-01T00:00:00Z',
				endTime: '2026-01-01T01:00:00Z',
			},
			json: true,
		});
		expect(result).toEqual([[{ json: { message: 'ok' }, pairedItem: { item: 0 } }]]);
	});

	it('runs a PromQL range query through the query URL', async () => {
		const response = { status: 'success', data: { resultType: 'matrix', result: [] } };
		const { context, request } = executionContext(
			{
				operation: 'queryPromql',
				dataset: 'otel_metrics',
				promqlQueryType: 'range',
				promqlQuery: 'rate(requests_total[5m])',
				promqlStart: '2026-01-01T00:00:00Z',
				promqlEnd: '2026-01-01T01:00:00Z',
				promqlStep: '1m',
			},
			response,
		);
		const result = await Parseable.prototype.execute.call(context);
		expect(request).toHaveBeenCalledWith(
			'parseableApi',
			expect.objectContaining({
				method: 'GET',
				url: 'https://query.example.com/prometheus/api/v1/query_range',
				qs: expect.objectContaining({ stream: 'otel_metrics', step: '1m' }),
			}),
		);
		expect(result[0][0]?.json).toEqual(response);
	});

	it('ingests events through the ingest URL', async () => {
		const { context, request } = executionContext(
			{
				operation: 'ingest',
				dataset: 'workflow-events',
				events: [{ message: 'one' }, { message: 'two' }],
			},
			undefined,
		);
		const result = await Parseable.prototype.execute.call(context);
		expect(request).toHaveBeenCalledWith('parseableApi', {
			method: 'POST',
			url: 'https://ingest.example.com/api/v1/ingest',
			headers: { 'X-P-Stream': 'workflow-events' },
			body: [{ message: 'one' }, { message: 'two' }],
			json: true,
		});
		expect(result[0][0]?.json).toEqual({
			success: true,
			dataset: 'workflow-events',
			eventCount: 2,
		});
	});

	it('rejects unknown operations instead of ingesting', async () => {
		const { context, request } = executionContext(
			{ operation: 'unknown', dataset: 'app-logs' },
			undefined,
		);
		await expect(Parseable.prototype.execute.call(context)).rejects.toThrow(
			'Unsupported operation',
		);
		expect(request).not.toHaveBeenCalled();
	});
});
