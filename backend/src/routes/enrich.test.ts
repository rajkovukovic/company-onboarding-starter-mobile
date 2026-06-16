import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { afterEach, beforeEach } from 'node:test';

import express from 'express';

import { enrichRouter } from './enrich';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type TestResponse = {
  statusCode: number;
  body: any;
};

const originalFetch = globalThis.fetch;
const originalCompaniesHouseApiKey = process.env.COMPANIES_HOUSE_API_KEY;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/enrich', enrichRouter);
  return app;
}

async function withApp<T>(callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');

  await new Promise<void>((resolve) => {
    server.once('listening', resolve);
  });

  const { port } = server.address() as AddressInfo;

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

async function postJson(baseUrl: string, payload: unknown): Promise<TestResponse> {
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = request(
      `${baseUrl}/enrich`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: res.statusCode ?? 0,
            body: rawBody ? JSON.parse(rawBody) : undefined,
          });
        });
      }
    );

    req.on('error', reject);
    req.end(body);
  });
}

function mockCompaniesHouse(responses: Record<string, JsonValue>) {
  const calls: string[] = [];

  globalThis.fetch = async (input) => {
    const url = new URL(input.toString());
    const key = `${url.pathname}${url.search}`;
    calls.push(key);
    const body = responses[key];

    if (!body) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return calls;
}

beforeEach(() => {
  delete process.env.COMPANIES_HOUSE_API_KEY;
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  if (originalCompaniesHouseApiKey === undefined) {
    delete process.env.COMPANIES_HOUSE_API_KEY;
  } else {
    process.env.COMPANIES_HOUSE_API_KEY = originalCompaniesHouseApiKey;
  }

  globalThis.fetch = originalFetch;
});

test('returns 400 when email or website is missing', async () => {
  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, { email: 'founder@example.com' });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: 'Email and website are required',
    });
  });
});

test('returns 400 when email is invalid', async () => {
  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'not-an-email',
      website: 'example.com',
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: 'A valid email is required',
    });
  });
});

test('returns 400 when website is invalid', async () => {
  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@example.com',
      website: 'not-a-domain',
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: 'A valid company website is required',
    });
  });
});

test('normalizes website and returns a warning when Companies House is unavailable', async () => {
  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@example.com',
      website: 'www.example.com/about?utm_source=test#team',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.input, {
      email: 'founder@example.com',
      website: 'https://example.com/about',
      domain: 'example.com',
    });
    assert.deepEqual(response.body.company, {});
    assert.deepEqual(response.body.enrichment.sources, []);
    assert.deepEqual(response.body.enrichment.fields, {});
    assert.match(
      response.body.enrichment.warnings[0],
      /COMPANIES_HOUSE_API_KEY is not configured/
    );
  });
});

test('maps a high-confidence Companies House match into structured company data', async () => {
  process.env.COMPANIES_HOUSE_API_KEY = 'test-key';
  const calls = mockCompaniesHouse({
    '/search/companies?q=acme&items_per_page=5': {
      items: [
        {
          title: 'ACME LIMITED',
          company_number: '12345678',
          company_status: 'active',
          company_type: 'ltd',
          date_of_creation: '2019-03-15',
        },
      ],
    },
    '/company/12345678': {
      company_name: 'ACME LIMITED',
      company_number: '12345678',
      company_status: 'active',
      type: 'ltd',
      date_of_creation: '2019-03-15',
      registered_office_address: {
        address_line_1: '123 Main Street',
        address_line_2: 'Suite 400',
        locality: 'London',
        region: 'Greater London',
        postal_code: 'EC1A 1BB',
        country: 'United Kingdom',
      },
    },
  });

  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@example.com',
      website: 'https://www.acme.co.uk',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [
      '/search/companies?q=acme&items_per_page=5',
      '/company/12345678',
    ]);
    assert.deepEqual(response.body.input, {
      email: 'founder@example.com',
      website: 'https://acme.co.uk',
      domain: 'acme.co.uk',
    });
    assert.deepEqual(response.body.company, {
      name: 'ACME LIMITED',
      registrationNumber: '12345678',
      status: 'active',
      incorporationDate: '2019-03-15',
      companyType: 'ltd',
      registeredAddress: {
        line1: '123 Main Street',
        line2: 'Suite 400',
        city: 'London',
        region: 'Greater London',
        postalCode: 'EC1A 1BB',
        country: 'United Kingdom',
      },
    });
    assert.deepEqual(response.body.enrichment.sources, ['Companies House']);

    for (const field of [
      'name',
      'registrationNumber',
      'status',
      'incorporationDate',
      'companyType',
      'registeredAddress',
    ]) {
      assert.equal(response.body.enrichment.fields[field].confidence, 'high');
      assert.deepEqual(response.body.enrichment.fields[field].sources, [
        'Companies House',
      ]);
      assert.equal(typeof response.body.enrichment.fields[field].reason, 'string');
      assert.ok(response.body.enrichment.fields[field].reason.length > 0);
    }
  });
});

test('returns partial data with a warning when Companies House has no usable match', async () => {
  process.env.COMPANIES_HOUSE_API_KEY = 'test-key';
  mockCompaniesHouse({
    '/search/companies?q=unknown%20company&items_per_page=5': {
      items: [],
    },
  });

  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@example.com',
      website: 'unknown-company.co.uk',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.input, {
      email: 'founder@example.com',
      website: 'https://unknown-company.co.uk',
      domain: 'unknown-company.co.uk',
    });
    assert.deepEqual(response.body.company, {});
    assert.deepEqual(response.body.enrichment.sources, []);
    assert.deepEqual(response.body.enrichment.fields, {});
    assert.match(
      response.body.enrichment.warnings[0],
      /No usable Companies House match found/
    );
  });
});
