import { Env } from '../types';

export interface ServiceUsage {
    name: string;
    usage: string;
    cost: number;
    limit?: string;
    percent?: number;
    note?: string;
}

export interface UsageSummary {
    totalProjectedCost: number;
    fetchedAt: string;
    services: ServiceUsage[];
}

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

export class UsageService {
    constructor(private env: Env) {}

    private async queryGraphQL(query: string, variables: Record<string, any>) {
        const res = await fetch(GRAPHQL_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.env.CF_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, variables }),
        });

        if (!res.ok) throw new Error(`Cloudflare GraphQL error: ${res.status}`);
        const json: any = await res.json();
        if (json.errors?.length) {
            console.error('[Usage] GraphQL errors:', JSON.stringify(json.errors));
        }
        return json.data;
    }

    async getUsageSummary(): Promise<UsageSummary> {
        // Date range: start of current month → now
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endNow = now.toISOString();

        const accountTag = this.env.CF_ACCOUNT_ID;

        // Run all 3 queries in parallel
        const [r2Storage, r2Ops, d1] = await Promise.allSettled([
            this.fetchR2Storage(accountTag, startOfMonth, endNow),
            this.fetchR2Operations(accountTag, startOfMonth, endNow),
            this.fetchD1(accountTag, startOfMonth, endNow),
        ]);

        // ── R2 Storage ───────────────────────────────────────────────────────
        const r2StorageGB = r2Storage.status === 'fulfilled' ? r2Storage.value : 0;
        const r2StorageCost = Math.max(0, (r2StorageGB - 10) * 0.015); // 10 GB free

        // ── R2 Operations ────────────────────────────────────────────────────
        const r2Ops_ = r2Ops.status === 'fulfilled' ? r2Ops.value : { classA: 0, classB: 0 };
        const r2OpsCost =
            Math.max(0, (r2Ops_.classA - 1_000_000) / 1_000_000 * 4.50) +
            Math.max(0, (r2Ops_.classB - 10_000_000) / 10_000_000 * 0.36);

        // ── D1 ───────────────────────────────────────────────────────────────
        const d1_ = d1.status === 'fulfilled' ? d1.value : { reads: 0, writes: 0 };
        const d1Cost = Math.max(0, (d1_.reads - 25_000_000) / 1_000_000 * 0.001) +
                       Math.max(0, (d1_.writes - 50_000) / 1_000_000 * 1.00);

        const totalCost = r2StorageCost + r2OpsCost + d1Cost;

        return {
            totalProjectedCost: Number(totalCost.toFixed(4)),
            fetchedAt: now.toUTCString(),
            services: [
                {
                    name: 'Workers AI',
                    usage: 'See Cloudflare Dashboard',
                    cost: 0,
                    limit: '10K neurons/day free',
                    percent: 0,
                    note: 'No public API for neuron usage — click the link below to see real-time usage.',
                },
                {
                    name: 'R2 Storage',
                    usage: `${r2StorageGB.toFixed(3)} GB`,
                    cost: Number(r2StorageCost.toFixed(4)),
                    limit: '10 GB free',
                    percent: Math.min(100, (r2StorageGB / 10) * 100),
                },
                {
                    name: 'R2 Operations',
                    usage: `${(r2Ops_.classA + r2Ops_.classB).toLocaleString()} ops`,
                    cost: Number(r2OpsCost.toFixed(4)),
                    limit: '1M ClassA / 10M ClassB free',
                    percent: Math.min(100, (r2Ops_.classA / 1_000_000) * 100),
                },
                {
                    name: 'D1 Database',
                    usage: `${d1_.reads.toLocaleString()} reads / ${d1_.writes.toLocaleString()} writes`,
                    cost: Number(d1Cost.toFixed(4)),
                    limit: '25M reads / 50K writes free',
                    percent: Math.min(100, (d1_.reads / 25_000_000) * 100),
                },
            ],
        };
    }

    // ── Private fetch helpers ────────────────────────────────────────────────

    private async fetchR2Storage(accountTag: string, start: string, end: string): Promise<number> {
        const query = `
        query R2Storage($accountTag: string!, $start: Time, $end: Time) {
            viewer {
                accounts(filter: { accountTag: $accountTag }) {
                    r2StorageAdaptiveGroups(
                        limit: 1,
                        filter: { datetime_geq: $start, datetime_leq: $end }
                    ) {
                        max { payloadSize metadataSize }
                    }
                }
            }
        }`;

        const data = await this.queryGraphQL(query, { accountTag, start, end });
        const groups = data?.viewer?.accounts?.[0]?.r2StorageAdaptiveGroups || [];
        if (!groups.length) return 0;

        const bytes = (groups[0].max?.payloadSize || 0) + (groups[0].max?.metadataSize || 0);
        return bytes / (1024 * 1024 * 1024);
    }

    private async fetchR2Operations(accountTag: string, start: string, end: string): Promise<{ classA: number; classB: number }> {
        const query = `
        query R2Ops($accountTag: string!, $start: Time, $end: Time) {
            viewer {
                accounts(filter: { accountTag: $accountTag }) {
                    r2OperationsAdaptiveGroups(
                        limit: 10000,
                        filter: { datetime_geq: $start, datetime_leq: $end }
                    ) {
                        sum { requests }
                        dimensions { actionType }
                    }
                }
            }
        }`;

        const data = await this.queryGraphQL(query, { accountTag, start, end });
        const groups = data?.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups || [];

        // Class A: writes (PutObject, CopyObject, CreateMultipartUpload, etc.)
        // Class B: reads (GetObject, HeadObject, ListObjects, etc.)
        const classAActions = new Set(['PutObject', 'CopyObject', 'CreateMultipartUpload', 'UploadPart', 'CompleteMultipartUpload', 'DeleteObject', 'DeleteObjects']);
        let classA = 0, classB = 0;

        for (const g of groups) {
            const action = g.dimensions?.actionType || '';
            const count = g.sum?.requests || 0;
            if (classAActions.has(action)) classA += count;
            else classB += count;
        }

        return { classA, classB };
    }

    private async fetchD1(accountTag: string, start: string, end: string): Promise<{ reads: number; writes: number }> {
        const query = `
        query D1Usage($accountTag: string!, $start: Time, $end: Time) {
            viewer {
                accounts(filter: { accountTag: $accountTag }) {
                    d1AnalyticsAdaptiveGroups(
                        limit: 10000,
                        filter: { datetime_geq: $start, datetime_leq: $end }
                    ) {
                        sum { readQueries writeQueries }
                    }
                }
            }
        }`;

        const data = await this.queryGraphQL(query, { accountTag, start, end });
        const groups = data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups || [];

        let reads = 0, writes = 0;
        for (const g of groups) {
            reads += g.sum?.readQueries || 0;
            writes += g.sum?.writeQueries || 0;
        }

        return { reads, writes };
    }
}
