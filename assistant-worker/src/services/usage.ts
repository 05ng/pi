import { Env } from '../types';

export interface UsageSummary {
    totalProjectedCost: number;
    services: {
        name: string;
        usage: string;
        cost: number;
        limit?: string;
        percent?: number;
    }[];
}

export class UsageService {
    constructor(private env: Env) {}

    async getUsageSummary(): Promise<UsageSummary> {
        // 1. Fetch data from DB
        const { count: docCount } = await this.env.DB.prepare('SELECT count(*) as count FROM documents').first() as any;

        // 2026 Estimated Pricing Rules
        // R2 Storage: $0.015 / GB. Avg 50KB per doc.
        // Workers AI: Uses Neurons for chat and categorization.
        // Assuming 200 neurons per doc ingest and 500 per chat.
        const totalNeurons = docCount * 700; 
        const aiCost = Math.max(0, (totalNeurons - 300000) / 1000 * 0.011); // 300k monthly free

        // R2 Storage: $0.015 / GB. Avg 50KB per doc.
        const totalBytes = docCount * 50 * 1024;
        const totalGB = totalBytes / (1024 * 1024 * 1024);
        const r2StorageCost = totalGB * 0.015;
        // R2 Ops: Class A ($4.50/M). 1 Doc = ~10 Ops (ingest + search).
        const r2OpsCost = (docCount * 10) / 1000000 * 4.50;

        // D1: $0.001 / mil reads. $1.00 / mil writes.
        const d1Reads = docCount * 50; // Every search/view reads metadata
        const d1Writes = docCount * 5; // Ingestion + edits
        const d1Cost = (d1Reads / 1000000 * 0.001) + (d1Writes / 1000000 * 1.00);

        // Vectorize: $0.05 / 100k vectors stored. $0.04 / 1M queried segments.
        const vectorizeStorageCost = (docCount * 5 / 100000) * 0.05; // ~5 chunks per doc

        // Total
        const totalCost = aiCost + r2StorageCost + r2OpsCost + d1Cost + vectorizeStorageCost;

        return {
            totalProjectedCost: Number(totalCost.toFixed(2)),
            services: [
                {
                    name: 'Workers AI',
                    usage: `${(totalNeurons/1000).toFixed(1)}K Neurons`,
                    cost: Number(aiCost.toFixed(2)),
                    limit: '10K/Day Free',
                    percent: Math.min(100, (totalNeurons / 300000) * 100)
                },
                {
                    name: 'R2 Storage',
                    usage: `${(totalBytes/1024).toFixed(1)} KB`,
                    cost: Number((r2StorageCost + r2OpsCost).toFixed(2)),
                    limit: '10GB Free',
                    percent: Math.min(100, (totalGB / 10) * 100)
                },
                {
                    name: 'D1 Database',
                    usage: `${docCount} Entries`,
                    cost: Number(d1Cost.toFixed(2)),
                    percent: Math.min(100, (docCount / 10000) * 100)
                },
                {
                    name: 'Vectorize',
                    usage: `${docCount * 5} Vectors`,
                    cost: Number(vectorizeStorageCost.toFixed(2)),
                    percent: Math.min(100, (docCount / 1000) * 100)
                }
            ]
        };
    }
}
