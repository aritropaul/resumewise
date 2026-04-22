// D1 HTTP API client that mimics the D1Database interface.
// Allows Better Auth (and other code expecting D1Database) to work
// from Vercel serverless functions via Cloudflare REST API.

interface D1HttpConfig {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

interface D1ApiResponse {
  result: Array<{
    results: Record<string, unknown>[];
    success: boolean;
    meta: Record<string, unknown>;
  }>;
  success: boolean;
  errors: Array<{ message: string }>;
}

class D1HttpPreparedStatement {
  private config: D1HttpConfig;
  private sql: string;
  private params: unknown[];

  constructor(config: D1HttpConfig, sql: string) {
    this.config = config;
    this.sql = sql;
    this.params = [];
  }

  bind(...values: unknown[]): D1HttpPreparedStatement {
    this.params = values;
    return this;
  }

  private async execute(): Promise<D1ApiResponse> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/d1/database/${this.config.databaseId}/query`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql: this.sql, params: this.params }),
    });
    const data = (await res.json()) as D1ApiResponse;
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || "D1 HTTP query failed");
    }
    return data;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    const data = await this.execute();
    return { results: (data.result?.[0]?.results ?? []) as T[] };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const { results } = await this.all<T>();
    return results[0] ?? null;
  }

  async run(): Promise<{ success: boolean }> {
    const data = await this.execute();
    return { success: data.success };
  }

  async raw(): Promise<unknown[][]> {
    const { results } = await this.all();
    return results.map((row) => Object.values(row));
  }
}

export class D1HttpDatabase {
  private config: D1HttpConfig;

  constructor(config: D1HttpConfig) {
    this.config = config;
  }

  prepare(sql: string): D1HttpPreparedStatement {
    return new D1HttpPreparedStatement(this.config, sql);
  }

  async batch(statements: D1HttpPreparedStatement[]): Promise<unknown[]> {
    const results = [];
    for (const stmt of statements) {
      results.push(await stmt.run());
    }
    return results;
  }

  async exec(sql: string): Promise<{ count: number }> {
    const stmt = this.prepare(sql);
    await stmt.run();
    return { count: 1 };
  }
}

export function createD1HttpDatabase(): D1HttpDatabase | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !apiToken) return null;
  return new D1HttpDatabase({ accountId, databaseId, apiToken });
}
