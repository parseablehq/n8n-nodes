# n8n-nodes-parseable

Official n8n community node for [Parseable](https://www.parseable.com/), an open source observability data lake.

## Features

- Query records with SQL.
- Query metrics with instant or range PromQL.
- Ingest JSON events into a Parseable dataset.
- Use separate query and ingestion endpoints for distributed deployments.
- Authenticate with a Parseable API key.
- Route requests to an optional Parseable tenant.
- Use the node as a tool in n8n AI Agent workflows.

## Requirements

- n8n with community-node support.
- Node.js 22.21 or newer for local development.
- A Parseable API key with only the permissions required by the selected operations.
- Parseable Cloud or Enterprise for PromQL. SQL and JSON ingestion are available without PromQL.

## Installation

After publication, install `n8n-nodes-parseable` from **Settings > Community Nodes** in n8n. Verified versions can also be discovered from the node panel.

## Credentials

Create **Parseable API** credentials in n8n:

| Field           | Purpose                                           |
| --------------- | ------------------------------------------------- |
| Query Base URL  | Parseable endpoint serving SQL and PromQL queries |
| Ingest Base URL | Parseable endpoint accepting JSON events          |
| API Key         | Sent as `Authorization: Bearer <API key>`         |
| Tenant ID       | Optional tenant sent as `X-P-Tenant`              |

For a standalone Parseable deployment, query and ingest URLs are normally identical. Distributed deployments can use different URLs. Do not include endpoint paths such as `/api/v1/query`; the node appends them.

The credential test calls `GET /api/v1/logstream` through the query URL. It confirms query-side authentication and reachability. Test ingestion separately before production use.

See [API key documentation](https://www.parseable.com/docs/user-guide/api-keys) and [multi-tenancy documentation](https://www.parseable.com/docs/user-guide/multi-tenancy).

## Operations

### Query Records (SQL)

Runs `POST /api/v1/query`. Select a dataset, start time, end time, and SQL query.

Use `{{dataset}}` wherever the quoted dataset identifier belongs:

```sql
SELECT *
FROM {{dataset}}
WHERE level = 'error'
ORDER BY p_timestamp DESC
LIMIT 50
```

The node safely quotes the selected dataset. Additional datasets can still be written explicitly for supported cross-dataset queries. Each returned row becomes one n8n output item.

### Query Metrics (PromQL)

Queries the selected metrics dataset through Parseable's Prometheus-compatible API:

- **Instant** uses `GET /prometheus/api/v1/query`.
- **Range** uses `GET /prometheus/api/v1/query_range` and requires start, end, and step.

Example:

```promql
rate(http_requests_total[5m])
```

The complete Prometheus response is returned as one n8n item. PromQL requires Parseable Cloud or Enterprise. See [PromQL documentation](https://www.parseable.com/docs/user-guide/promql).

### Ingest Events

Sends a JSON object or non-empty array of objects to `POST /api/v1/ingest`. The selected dataset is sent as `X-P-Stream`. Parseable can create the dataset on first ingestion when server configuration and API-key permissions allow it.

The default event value is current n8n item:

```text
{{$json}}
```

Successful output includes dataset name and ingested event count. This operation is intended for workflow events and records. Use OpenTelemetry collectors for complete n8n platform logs and traces.

## Workflow examples

```text
Schedule → Parseable SQL query → IF errors exist → Slack
Webhook → Transform event → Parseable ingest
AI Agent → Parseable SQL/PromQL tool → Investigation summary
```

## Execution behavior

- Each incoming n8n item is processed independently.
- Dataset names support n8n expressions, for example `{{$json.dataset}}`.
- SQL and PromQL requests use Query Base URL; ingestion uses Ingest Base URL.
- With **Continue On Fail** disabled, invalid parameters or API failures stop execution.
- With **Continue On Fail** enabled, failures return an item containing `error` and processing continues.
- URLs must use HTTP or HTTPS and cannot contain embedded credentials, query parameters, or fragments.
- Empty datasets, invalid time ranges, empty ingestion arrays, and non-object events are rejected before a request is sent.

## Permissions

Use least-privilege API keys:

- Query permission for SQL and PromQL.
- Ingest permission for event ingestion.
- Tenant-scoped permissions when multi-tenancy is enabled.

Avoid sending passwords, credentials, personal data, or secrets as events.

## Development

```bash
npm ci
npm test
npm run lint
npm run build
npm pack --dry-run
```

Run `npm run dev` to test node in local n8n.

## Security

See [SECURITY.md](SECURITY.md).

## License

[MIT License](LICENSE)
