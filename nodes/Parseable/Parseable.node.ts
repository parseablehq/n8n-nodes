import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, '');
}
export function isValidBaseUrl(baseUrl: string): boolean {
	try {
		const url = new URL(baseUrl);
		return (
			(url.protocol === 'http:' || url.protocol === 'https:') &&
			url.username === '' &&
			url.password === '' &&
			url.search === '' &&
			url.hash === ''
		);
	} catch {
		return false;
	}
}
export function normalizeDataset(dataset: string): string | undefined {
	const normalized = dataset.trim();
	const containsControlCharacter = [...normalized].some((character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint <= 31 || codePoint === 127;
	});
	return normalized !== '' && !containsControlCharacter ? normalized : undefined;
}
export function normalizeEvents(value: unknown): IDataObject[] | undefined {
	const isObject = (event: unknown): event is IDataObject =>
		typeof event === 'object' && event !== null && !Array.isArray(event);
	if (Array.isArray(value)) {
		return value.length > 0 && value.every(isObject) ? value : undefined;
	}

	return isObject(value) ? [value] : undefined;
}
export function renderSqlQuery(query: string, dataset: string): string | undefined {
	if (!query.includes('{{dataset}}')) {
		return undefined;
	}

	return query.replaceAll('{{dataset}}', `"${dataset.replaceAll('"', '""')}"`);
}
export function isValidTimeRange(start: string, end: string): boolean {
	const startTime = Date.parse(start);
	const endTime = Date.parse(end);
	return Number.isFinite(startTime) && Number.isFinite(endTime) && startTime <= endTime;
}

export class Parseable implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Parseable',
		name: 'parseable',
		icon: { light: 'file:parseable.svg', dark: 'file:parseable.dark.svg' },
		group: ['input', 'output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Query and ingest observability data with Parseable',
		defaults: { name: 'Parseable' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'parseableApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Ingest Events',
						value: 'ingest',
						description: 'Send JSON events to a dataset',
						action: 'Ingest events',
					},
					{
						name: 'Query Metrics (PromQL)',
						value: 'queryPromql',
						description: 'Run a PromQL query (Parseable Cloud and Enterprise)',
						action: 'Query metrics',
					},
					{
						name: 'Query Records (SQL)',
						value: 'querySql',
						description: 'Run a SQL query over Parseable data',
						action: 'Query records with SQL',
					},
				],
				default: 'querySql',
			},
			{
				displayName: 'Dataset Name',
				name: 'dataset',
				type: 'string',
				default: '',
				required: true,
				description: 'Dataset used by the selected operation',
			},
			{
				displayName: 'SQL Query',
				name: 'query',
				type: 'string',
				typeOptions: { rows: 5 },
				default: 'SELECT * FROM {{dataset}} LIMIT 50',
				required: true,
				displayOptions: { show: { operation: ['querySql'] } },
				description: 'SQL query; {{dataset}} is safely replaced with Dataset Name',
			},
			{
				displayName: 'Start Time',
				name: 'startTime',
				type: 'dateTime',
				default: '={{$now.minus({ hours: 1 }).toISO()}}',
				required: true,
				displayOptions: { show: { operation: ['querySql'] } },
			},
			{
				displayName: 'End Time',
				name: 'endTime',
				type: 'dateTime',
				default: '={{$now.toISO()}}',
				required: true,
				displayOptions: { show: { operation: ['querySql'] } },
			},
			{
				displayName: 'Query Type',
				name: 'promqlQueryType',
				type: 'options',
				options: [
					{ name: 'Instant', value: 'instant' },
					{ name: 'Range', value: 'range' },
				],
				default: 'range',
				displayOptions: { show: { operation: ['queryPromql'] } },
			},
			{
				displayName: 'PromQL Query',
				name: 'promqlQuery',
				type: 'string',
				typeOptions: { rows: 3 },
				default: 'rate(http_requests_total[5m])',
				required: true,
				displayOptions: { show: { operation: ['queryPromql'] } },
			},
			{
				displayName: 'Evaluation Time',
				name: 'promqlTime',
				type: 'dateTime',
				default: '={{$now.toISO()}}',
				displayOptions: {
					show: { operation: ['queryPromql'], promqlQueryType: ['instant'] },
				},
			},
			{
				displayName: 'Start Time',
				name: 'promqlStart',
				type: 'dateTime',
				default: '={{$now.minus({ hours: 1 }).toISO()}}',
				required: true,
				displayOptions: {
					show: { operation: ['queryPromql'], promqlQueryType: ['range'] },
				},
			},
			{
				displayName: 'End Time',
				name: 'promqlEnd',
				type: 'dateTime',
				default: '={{$now.toISO()}}',
				required: true,
				displayOptions: {
					show: { operation: ['queryPromql'], promqlQueryType: ['range'] },
				},
			},
			{
				displayName: 'Step',
				name: 'promqlStep',
				type: 'string',
				default: '1m',
				required: true,
				displayOptions: {
					show: { operation: ['queryPromql'], promqlQueryType: ['range'] },
				},
				description: 'Query resolution, such as 15s, 1m, or 5m',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'json',
				default: '={{$json}}',
				required: true,
				displayOptions: { show: { operation: ['ingest'] } },
				description: 'JSON object or array of objects to ingest',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const credentials = await this.getCredentials('parseableApi');
				const rawQueryBaseUrl = credentials.queryBaseUrl as string;
				const rawIngestBaseUrl = credentials.ingestBaseUrl as string;
				if (!isValidBaseUrl(rawQueryBaseUrl) || !isValidBaseUrl(rawIngestBaseUrl)) {
					throw new NodeOperationError(
						this.getNode(),
						'Base URLs must be valid HTTP or HTTPS URLs without credentials, query parameters, or fragments',
						{ itemIndex },
					);
				}
				const queryBaseUrl = normalizeBaseUrl(rawQueryBaseUrl);
				const ingestBaseUrl = normalizeBaseUrl(rawIngestBaseUrl);
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const dataset = normalizeDataset(this.getNodeParameter('dataset', itemIndex) as string);
				if (!dataset) {
					throw new NodeOperationError(
						this.getNode(),
						'Dataset Name cannot be empty or contain control characters',
						{
							itemIndex,
						},
					);
				}
				if (operation === 'querySql') {
					const startTime = this.getNodeParameter('startTime', itemIndex) as string;
					const endTime = this.getNodeParameter('endTime', itemIndex) as string;
					if (!isValidTimeRange(startTime, endTime)) {
						throw new NodeOperationError(
							this.getNode(),
							'Start Time must be before or equal to End Time',
							{
								itemIndex,
							},
						);
					}
					const query = renderSqlQuery(
						this.getNodeParameter('query', itemIndex) as string,
						dataset,
					);
					if (!query) {
						throw new NodeOperationError(
							this.getNode(),
							'SQL Query must include the {{dataset}} placeholder',
							{ itemIndex },
						);
					}
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'parseableApi',
						{
							method: 'POST',
							url: `${queryBaseUrl}/api/v1/query`,
							body: {
								query,
								startTime,
								endTime,
							},
							json: true,
						},
					);
					for (const row of Array.isArray(response) ? response : [response])
						returnData.push({
							json: row as IDataObject,
							pairedItem: { item: itemIndex },
						});
				} else if (operation === 'queryPromql') {
					const queryType = this.getNodeParameter('promqlQueryType', itemIndex) as string;
					if (queryType !== 'instant' && queryType !== 'range') {
						throw new NodeOperationError(
							this.getNode(),
							`Unsupported PromQL query type: ${queryType}`,
							{
								itemIndex,
							},
						);
					}
					const promqlQuery = (this.getNodeParameter('promqlQuery', itemIndex) as string).trim();
					if (!promqlQuery) {
						throw new NodeOperationError(this.getNode(), 'PromQL Query cannot be empty', {
							itemIndex,
						});
					}
					const qs: IDataObject = {
						query: promqlQuery,
						stream: dataset,
						timestamp_format: 'rfc3339',
					};
					if (queryType === 'instant') {
						const time = this.getNodeParameter('promqlTime', itemIndex) as string;
						if (!Number.isFinite(Date.parse(time))) {
							throw new NodeOperationError(this.getNode(), 'Evaluation Time must be valid', {
								itemIndex,
							});
						}
						qs.time = time;
					} else {
						const start = this.getNodeParameter('promqlStart', itemIndex) as string;
						const end = this.getNodeParameter('promqlEnd', itemIndex) as string;
						if (!isValidTimeRange(start, end)) {
							throw new NodeOperationError(
								this.getNode(),
								'Start Time must be before or equal to End Time',
								{ itemIndex },
							);
						}
						qs.start = start;
						qs.end = end;
						const step = (this.getNodeParameter('promqlStep', itemIndex) as string).trim();
						if (!step) {
							throw new NodeOperationError(this.getNode(), 'Step cannot be empty', { itemIndex });
						}
						qs.step = step;
					}
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'parseableApi',
						{
							method: 'GET',
							url: `${queryBaseUrl}/prometheus/api/v1/${queryType === 'instant' ? 'query' : 'query_range'}`,
							qs,
							json: true,
						},
					);
					returnData.push({
						json: response as IDataObject,
						pairedItem: { item: itemIndex },
					});
				} else if (operation === 'ingest') {
					const events = normalizeEvents(this.getNodeParameter('events', itemIndex));
					if (!events) {
						throw new NodeOperationError(
							this.getNode(),
							'Events must be a JSON object or a non-empty array of JSON objects',
							{ itemIndex },
						);
					}
					await this.helpers.httpRequestWithAuthentication.call(this, 'parseableApi', {
						method: 'POST',
						url: `${ingestBaseUrl}/api/v1/ingest`,
						headers: { 'X-P-Stream': dataset },
						body: events,
						json: true,
					});
					returnData.push({
						json: { success: true, dataset, eventCount: events.length },
						pairedItem: { item: itemIndex },
					});
				} else {
					throw new NodeOperationError(this.getNode(), `Unsupported operation: ${operation}`, {
						itemIndex,
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error instanceof Error ? error.message : String(error),
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error.message, { itemIndex });
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
			}
		}
		return [returnData];
	}
}
