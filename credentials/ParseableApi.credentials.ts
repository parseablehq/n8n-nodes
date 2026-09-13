import type {
	IAuthenticate,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ParseableApi implements ICredentialType {
	name = 'parseableApi';
	displayName = 'Parseable API';
	icon = 'file:parseable.svg' as const;
	documentationUrl = 'https://www.parseable.com/docs/user-guide/api-keys';
	properties: INodeProperties[] = [
		{
			displayName: 'Query Base URL',
			name: 'queryBaseUrl',
			type: 'string',
			default: 'http://localhost:8000',
			placeholder: 'https://query.parseable.example.com',
			description: 'URL serving SQL and PromQL queries',
			required: true,
		},
		{
			displayName: 'Ingest Base URL',
			name: 'ingestBaseUrl',
			type: 'string',
			default: 'http://localhost:8000',
			placeholder: 'https://ingest.parseable.example.com',
			description: 'URL accepting event ingestion',
			required: true,
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Tenant ID',
			name: 'tenantId',
			type: 'string',
			default: '',
			description: 'Tenant ID for multi-tenant installations such as Parseable Cloud',
		},
	];
	authenticate: IAuthenticate = async (credentials, requestOptions) => {
		requestOptions.headers = {
			...requestOptions.headers,
			Authorization: `Bearer ${credentials.apiKey as string}`,
		};
		if (credentials.tenantId) {
			requestOptions.headers['X-P-Tenant'] = credentials.tenantId as string;
		}

		return requestOptions;
	};
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.queryBaseUrl.replace(/\\/+$/, "")}}',
			url: '/api/v1/logstream',
			method: 'GET',
		},
	};
}
