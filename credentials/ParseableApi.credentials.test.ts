import { describe, expect, it } from 'vitest';
import type { ICredentialDataDecryptedObject, IHttpRequestOptions } from 'n8n-workflow';
import { ParseableApi } from './ParseableApi.credentials';

describe('Parseable API credentials', () => {
	it('adds the API key as a Bearer token', async () => {
		const credential = new ParseableApi();
		if (typeof credential.authenticate !== 'function') throw new Error('Expected function auth');
		const request = await credential.authenticate(
			{ apiKey: 'px_test' } as ICredentialDataDecryptedObject,
			{ url: 'https://query.example.com' } as IHttpRequestOptions,
		);
		expect(request.headers).toMatchObject({ Authorization: 'Bearer px_test' });
	});

	it('adds x-p-tenant only when configured', async () => {
		const credential = new ParseableApi();
		if (typeof credential.authenticate !== 'function') throw new Error('Expected function auth');
		const request = await credential.authenticate(
			{ apiKey: 'px_test', tenantId: 'acme' } as ICredentialDataDecryptedObject,
			{ url: 'https://query.example.com' } as IHttpRequestOptions,
		);
		expect(request.headers).toMatchObject({
			Authorization: 'Bearer px_test',
			'X-P-Tenant': 'acme',
		});
	});
});
